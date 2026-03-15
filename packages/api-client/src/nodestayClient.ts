import { normalizeIdempotencyKey } from '@nodestay/domain';
import type {
  ComputeNodeItem,
  ComputeJobListItem,
  SubmitJobBody,
  SubmitJobResponse,
  GetJobResponse,
  CancelJobResponse,
  JobResultResponse,
} from '@nodestay/api-contracts';

export interface NodeStayClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

type JsonObject = Record<string, unknown>;

export class NodeStayApiError extends Error {
  readonly status: number;
  readonly bodyText: string;
  readonly bodyJson: unknown;

  constructor(params: {
    status: number;
    bodyText: string;
    bodyJson: unknown;
    message: string;
  }) {
    super(params.message);
    this.name = 'NodeStayApiError';
    this.status = params.status;
    this.bodyText = params.bodyText;
    this.bodyJson = params.bodyJson;
  }
}

export class NodeStayClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NodeStayClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let bodyJson: unknown = null;
      if (text) {
        try {
          bodyJson = JSON.parse(text);
        } catch {
          bodyJson = null;
        }
      }
      const payloadMessage =
        bodyJson &&
        typeof bodyJson === 'object' &&
        'message' in bodyJson &&
        typeof (bodyJson as { message?: unknown }).message === 'string'
          ? (bodyJson as { message: string }).message
          : null;
      throw new NodeStayApiError({
        status: res.status,
        bodyText: text,
        bodyJson,
        message: payloadMessage ?? `APIエラー: ${res.status}${text ? ` - ${text}` : ''}`,
      });
    }
    return (await res.json()) as T;
  }

  async health(): Promise<{ ok: true }> {
    return await this.json('/v1/health');
  }

  async listVenues(): Promise<
    Array<{
      venueId: string;
      name: string;
      address: string;
      timezone: string;
      latitude: number;
      longitude: number;
      amenities?: string[];
      openHours?: string;
      availableSeats?: number;
      totalSeats?: number;
      cheapestPlanMinor?: number;
    }>
  > {
    const rows = await this.json<Array<{
      id: string;
      name: string;
      address: string | null;
      timezone: string;
      latitude: number | null;
      longitude: number | null;
      amenities?: string[];
      openHours?: string | null;
      totalSeats?: number;
    }>>('/v1/venues');

    return rows.map((v) => ({
      venueId: v.id,
      name: v.name,
      address: v.address ?? '',
      timezone: v.timezone,
      latitude: v.latitude ?? 0,
      longitude: v.longitude ?? 0,
      amenities: v.amenities ?? [],
      openHours: v.openHours ?? undefined,
      totalSeats: v.totalSeats ?? undefined,
    }));
  }

  async listUsageProducts(venueId: string): Promise<
    Array<{
      productId: string;
      venueId: string;
      name: string;
      baseDurationMinutes: number;
      basePriceMinor: number;
      depositRequiredMinor: number;
    }>
  > {
    const rows = await this.json<Array<{
      id: string;
      productName: string;
      durationMinutes: number | null;
      priceJpyc: string;
    }>>(`/v1/venues/${encodeURIComponent(venueId)}/plans`);

    return rows.map((p) => ({
      productId: p.id,
      venueId,
      name: p.productName,
      baseDurationMinutes: p.durationMinutes ?? 60,
      // DB の priceJpyc は「JPYC単位」運用のため、UI minor へ変換する
      basePriceMinor: Number(p.priceJpyc) * 100,
      depositRequiredMinor: 0,
    }));
  }

  /** @deprecated Use listUsageProducts */
  async listPlans(venueId: string) {
    return await this.listUsageProducts(venueId);
  }

  async verifyIdentity(input: { userId: string; venueId: string }): Promise<{ identityVerificationId: string }> {
    return await this.json('/v1/identity/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  async checkinSession(input: {
    usageRightId: string;
    venueId: string;
    machineId?: string;
    identityVerificationId?: string;
  }): Promise<{ sessionId: string }> {
    return await this.json('/v1/sessions/checkin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  async checkoutSession(
    input: { sessionId: string; payerWallet?: string },
    idempotencyKey: string,
  ): Promise<JsonObject> {
    const key = normalizeIdempotencyKey(idempotencyKey);
    return await this.json('/v1/sessions/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify(input),
    });
  }

  async getBalance(walletAddress?: string): Promise<{ currency: 'JPYC'; balanceMinor: number; depositHeldMinor: number }> {
    const query = walletAddress ? `?wallet=${encodeURIComponent(walletAddress)}` : '';
    return await this.json(`/v1/user/balance${query}`);
  }

  async createVenueAsMerchant(input: {
    name: string;
    address: string;
    timezone: string;
  }): Promise<{ venueId: string; name: string; address: string; timezone: string }> {
    return await this.json('/v1/merchant/venues', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  async listMyMerchantVenues(): Promise<Array<{
    venueId: string;
    merchantId: string;
    name: string;
    address: string;
    timezone: string;
    latitude: number;
    longitude: number;
    totalSeats?: number;
    treasuryWallet?: string | null;
  }>> {
    const rows = await this.json<Array<{
      id: string;
      merchantId: string;
      name: string;
      address: string | null;
      timezone: string;
      latitude: number | null;
      longitude: number | null;
      totalSeats?: number | null;
      merchant?: {
        treasuryWallet?: string | null;
      } | null;
    }>>('/v1/merchant/venues');

    return rows.map((v) => ({
      venueId: v.id,
      merchantId: v.merchantId,
      name: v.name,
      address: v.address ?? '',
      timezone: v.timezone,
      latitude: v.latitude ?? 0,
      longitude: v.longitude ?? 0,
      totalSeats: v.totalSeats ?? undefined,
      treasuryWallet: v.merchant?.treasuryWallet ?? null,
    }));
  }

  async getVenueTreasuryWallet(venueId: string): Promise<{
    venueId: string;
    merchantId: string;
    ownerUserId: string | null;
    treasuryWallet: string | null;
  }> {
    return await this.json(`/v1/merchant/venues/${encodeURIComponent(venueId)}/treasury-wallet`);
  }

  async upsertVenueTreasuryWallet(
    venueId: string,
    treasuryWallet: string,
  ): Promise<{
    venueId: string;
    merchantId: string;
    ownerUserId: string | null;
    treasuryWallet: string;
  }> {
    return await this.json(`/v1/merchant/venues/${encodeURIComponent(venueId)}/treasury-wallet`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ treasuryWallet }),
    });
  }

  async upsertUsageProduct(
    venueId: string,
    body: {
      productName: string;
      usageType: 'HOURLY' | 'PACK' | 'NIGHT' | 'FLEX';
      durationMinutes: number;
      priceJpyc: string;
      transferable?: boolean;
      maxTransferCount?: number;
    },
  ): Promise<{ productId: string }> {
    return await this.json(`/v1/merchant/venues/${encodeURIComponent(venueId)}/products`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async upsertSeat(
    venueId: string,
    body: { seatId?: string; type: string; status?: string }
  ): Promise<{ seatId: string; venueId: string; type: string; status: string }> {
    return await this.json(`/v1/merchant/venues/${encodeURIComponent(venueId)}/seats`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async enableCompute(venueId: string, enable: boolean): Promise<{ venueId: string; computeEnabled: boolean }> {
    return await this.json(`/v1/merchant/venues/${encodeURIComponent(venueId)}/compute/enable`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enable }),
    });
  }

  async listMerchantComputeNodes(venueId?: string): Promise<Array<{
    nodeId: string;
    venueId: string;
    seatId: string;
    seatLabel: string;
    status: 'IDLE' | 'OFFLINE' | 'COMPUTING' | 'RESERVED';
    enabled: boolean;
    configured: boolean;
    machineId: string;
    onchainTokenId: string | null;
    pricePerHourMinor: number;
    minBookingHours: number;
    maxBookingHours: number;
    supportedTasks: string[];
    availableWindows: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
    specs: {
      cpuModel: string;
      cpuCores: number;
      gpuModel: string;
      vram: number;
      ram: number;
    };
    earnings: {
      thisMonthMinor: number;
      totalMinor: number;
      completedJobs: number;
      uptimePercent: number;
    };
  }>> {
    const query = venueId ? `?venueId=${encodeURIComponent(venueId)}` : '';
    return await this.json(`/v1/merchant/compute/nodes${query}`);
  }

  async upsertMerchantComputeNode(
    machineId: string,
    body: {
      enabled: boolean;
      pricePerHourMinor: number;
      minBookingHours: number;
      maxBookingHours: number;
      supportedTasks: string[];
      availableWindows: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
    },
  ): Promise<{
    nodeId: string;
    venueId: string;
    seatId: string;
    seatLabel: string;
    status: 'IDLE' | 'OFFLINE' | 'COMPUTING' | 'RESERVED';
    enabled: boolean;
    configured: boolean;
    machineId: string;
    onchainTokenId: string | null;
    pricePerHourMinor: number;
    minBookingHours: number;
    maxBookingHours: number;
    supportedTasks: string[];
    availableWindows: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
    specs: {
      cpuModel: string;
      cpuCores: number;
      gpuModel: string;
      vram: number;
      ram: number;
    };
    earnings: {
      thisMonthMinor: number;
      totalMinor: number;
      completedJobs: number;
      uptimePercent: number;
    };
  }> {
    return await this.json(`/v1/merchant/compute/nodes/${encodeURIComponent(machineId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async removeMerchantComputeNode(
    machineId: string,
  ): Promise<{ nodeId: string; removed: true }> {
    return await this.json(`/v1/merchant/compute/nodes/${encodeURIComponent(machineId)}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
    });
  }

  async createDispute(body: { venueId: string; reason: string }): Promise<{ disputeId: string; venueId: string; reason: string; status: string; createdAtIso: string }> {
    return await this.json('/v1/merchant/disputes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // --- Machine API ---

  /** POST /v1/machines — マシン登録 */
  async registerMachine(input: {
    venueId: string;
    machineClass: string;
    cpu?: string;
    gpu?: string;
    ramGb?: number;
    storageGb?: number;
    localSerial?: string;
    metadataUri?: string;
  }): Promise<{
    id: string;
    machineId: string;
    onchainMachineId?: string;
    status: string;
    onchainTokenId?: string | null;
    onchainTxHash?: string | null;
  }> {
    return await this.json('/v1/machines', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  /** GET /v1/machines — マシン一覧 */
  async listMachines(params?: { venueId?: string; status?: string }): Promise<
    Array<{
      id: string;
      machineId: string;
      venueId: string;
      machineClass: string;
      localSerial: string | null;
      cpu: string | null;
      gpu: string | null;
      ramGb: number | null;
      storageGb: number | null;
      status: string;
      onchainTokenId: string | null;
    }>
  > {
    const query = new URLSearchParams();
    if (params?.venueId) query.set('venueId', params.venueId);
    if (params?.status)  query.set('status',  params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return await this.json(`/v1/machines${qs}`);
  }

  /** GET /v1/machines/:id — マシン詳細 */
  async getMachine(id: string): Promise<{
    id: string;
    machineId: string;
    venueId: string;
    machineClass: string;
    localSerial: string | null;
    cpu: string | null;
    gpu: string | null;
    ramGb: number | null;
    storageGb: number | null;
    status: string;
    onchainTokenId: string | null;
    onchainTxHash: string | null;
    venue: { name: string };
  }> {
    return await this.json(`/v1/machines/${encodeURIComponent(id)}`);
  }

  /** PATCH /v1/machines/:id/status — ステータス変更 */
  async updateMachineStatus(id: string, status: string): Promise<{ id: string; machineId: string; status: string }> {
    return await this.json(`/v1/machines/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }

  /** DELETE /v1/machines/:id — マシン削除（廃止） */
  async deleteMachine(id: string): Promise<{ id: string; machineId: string; status: string }> {
    return await this.json(`/v1/machines/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
    });
  }

  // --- UsageRight API ---

  /** GET /v1/usage-rights — 利用権一覧 */
  async listUsageRights(params?: { ownerUserId?: string; status?: string }): Promise<
    Array<{
      id: string;
      status: string;
      onchainTokenId: string | null;
      onchainTxHash: string | null;
      usageProduct: {
        name: string;
        durationMinutes: number;
        priceMinor: number;
        venue: { name: string; id: string };
      };
    }>
  > {
    const query = new URLSearchParams();
    if (params?.ownerUserId) query.set('ownerUserId', params.ownerUserId);
    if (params?.status)      query.set('status',      params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return await this.json(`/v1/usage-rights${qs}`);
  }

  /** GET /v1/usage-rights/:id — 利用権詳細 */
  async getUsageRight(id: string): Promise<{
    id: string;
    status: string;
    onchainTokenId: string | null;
    onchainTxHash: string | null;
    transferable: boolean;
    transferCount: number;
    maxTransferCount?: number;
    transferCutoff: string | null;
    startAt?: string | null;
    endAt?: string | null;
    remainingMinutes?: number;
    usageProduct: {
      id: string;
      name: string;
      productName?: string;
      durationMinutes: number;
      priceMinor: number;
      priceJpyc?: string;
      depositRequiredMinor: number;
      venueId?: string;
      venue?: {
        id?: string;
        name?: string;
        address?: string | null;
      } | null;
    };
  }> {
    return await this.json(`/v1/usage-rights/${encodeURIComponent(id)}`);
  }

  /** POST /v1/usage-rights/:id/cancel — 利用権キャンセル */
  async cancelUsageRight(id: string): Promise<{ id: string; status: string }> {
    return await this.json(`/v1/usage-rights/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
  }

  /** POST /v1/usage-rights/:id/transfer — 利用権譲渡 */
  async transferUsageRight(
    id: string,
    newOwnerUserId: string,
    onchainTxHash: string,
    idempotencyKey: string,
    fromWallet?: string,
  ): Promise<{ usageRightId: string; status: string }> {
    const key = normalizeIdempotencyKey(idempotencyKey);
    return await this.json(`/v1/usage-rights/${encodeURIComponent(id)}/transfer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({ newOwnerUserId, onchainTxHash, fromWallet }),
    });
  }

  async purchaseUsageRight(
    input: { productId: string; ownerUserId?: string; buyerWallet?: string },
    idempotencyKey: string,
  ): Promise<{ usageRightId: string }> {
    const key = normalizeIdempotencyKey(idempotencyKey);
    return await this.json<{ usageRightId: string }>('/v1/usage-rights/purchase', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify(input),
    });
  }

  // --- Session API ---

  /** GET /v1/sessions/:sessionId — セッション詳細 */
  async getSession(sessionId: string): Promise<{
    sessionId: string;
    usageRightId: string;
    planName: string;
    venueName: string;
    venueId: string;
    machineId: string | null;
    checkedInAt: string;
    checkedOutAt: string | null;
    status: string;
    settlementTxHash: string | null;
    baseDurationMinutes: number;
    basePriceMinor: number;
  }> {
    return this.json(`/v1/sessions/${encodeURIComponent(sessionId)}`);
  }

  /** GET /v1/sessions — セッション一覧 */
  async listSessions(params?: {
    userId?: string;
    status?: string;
    limit?: number;
  }): Promise<Array<{
    sessionId: string;
    usageRightId: string;
    planName: string;
    venueName: string;
    venueId: string;
    machineId: string | null;
    checkedInAt: string;
    checkedOutAt: string | null;
    status: string;
    settlementTxHash: string | null;
    baseDurationMinutes: number;
    basePriceMinor: number;
  }>> {
    const q = new URLSearchParams();
    if (params?.userId) q.set('userId', params.userId);
    if (params?.status) q.set('status', params.status);
    if (params?.limit) q.set('limit', String(params.limit));
    return this.json(`/v1/sessions?${q.toString()}`);
  }

  // --- Marketplace API ---

  /** GET /v1/marketplace/listings — マーケットプレイス出品一覧 */
  async listMarketplaceListings(params?: {
    venueId?: string;
    minPriceJpyc?: string;
    maxPriceJpyc?: string;
  }): Promise<Array<{
    id: string;
    usageRightId: string;
    sellerUserId: string;
    priceJpyc: string;
    status: string;
    expiryAt: string | null;
    soldAt: string | null;
    onchainListingId: string | null;
    onchainTxHash: string | null;
    venueName?: string | null;
    usageRight: {
      id: string;
      status: string;
      startAt: string | null;
      endAt: string | null;
      usageProduct: {
        id: string;
        productName: string;
        durationMinutes: number;
        usageType: string;
        venueId: string;
      } | null;
    } | null;
    createdAt: string;
  }>> {
    const q = new URLSearchParams();
    if (params?.venueId) q.set('venueId', params.venueId);
    if (params?.minPriceJpyc) q.set('minPriceJpyc', params.minPriceJpyc);
    if (params?.maxPriceJpyc) q.set('maxPriceJpyc', params.maxPriceJpyc);
    return this.json(`/v1/marketplace/listings?${q.toString()}`);
  }

  /** POST /v1/marketplace/listings — 出品作成（Idempotency-Key 必須） */
  async createMarketplaceListing(
    input: {
      usageRightId: string;
      sellerUserId?: string;
      sellerWallet?: string;
      priceJpyc: string;
      expiryAt?: string;
      onchainTxHash: string;
    },
    idempotencyKey: string,
  ): Promise<{
    id: string;
    usageRightId: string;
    sellerUserId: string;
    priceJpyc: string;
    status: string;
    expiryAt: string | null;
    soldAt: string | null;
    onchainListingId: string | null;
    onchainTxHash: string | null;
  }> {
    return this.json('/v1/marketplace/listings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': normalizeIdempotencyKey(idempotencyKey),
      },
      body: JSON.stringify(input),
    });
  }

  /** DELETE /v1/marketplace/listings/:id — 出品キャンセル（Idempotency-Key 必須） */
  async cancelMarketplaceListing(
    listingId: string,
    userId: string,
    onchainTxHash: string,
    idempotencyKey: string,
    sellerWallet?: string,
  ): Promise<{
    id: string;
    status: string;
    usageRightId: string;
  }> {
    return this.json(`/v1/marketplace/listings/${encodeURIComponent(listingId)}`, {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': normalizeIdempotencyKey(idempotencyKey),
      },
      body: JSON.stringify({ userId, sellerWallet, onchainTxHash }),
    });
  }

  /** POST /v1/marketplace/listings/:id/buy — 出品購入（Idempotency-Key 必須） */
  async buyMarketplaceListing(
    listingId: string,
    buyerUserId: string,
    buyerWallet: string | undefined,
    onchainTxHash: string,
    idempotencyKey: string,
  ): Promise<{
    id: string;
    status: string;
    usageRightId: string;
    buyerUserId: string;
  }> {
    return this.json(`/v1/marketplace/listings/${encodeURIComponent(listingId)}/buy`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': normalizeIdempotencyKey(idempotencyKey),
      },
      body: JSON.stringify({ buyerUserId, buyerWallet, onchainTxHash }),
    });
  }

  // --- Machine Slots API ---

  /** GET /v1/machines/:machineId/slots — マシンのスロット一覧 */
  async getMachineSlots(machineId: string, params?: {
    from?: string;  // ISO datetime
    to?: string;    // ISO datetime
  }): Promise<Array<{
    id: string;
    machineId: string;
    slotStart: string;
    slotEnd: string;
    slotType: string;
    occupancyStatus: string;
    referenceType: string | null;
    referenceId: string | null;
  }>> {
    const q = new URLSearchParams();
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    return this.json(`/v1/machines/${encodeURIComponent(machineId)}/slots?${q.toString()}`);
  }

  // --- Compute API (S6); types from @nodestay/api-contracts (I1) ---

  /** GET /v1/compute/nodes */
  async listComputeNodes(): Promise<ComputeNodeItem[]> {
    return await this.json<ComputeNodeItem[]>('/v1/compute/nodes');
  }

  /** POST /v1/compute/jobs */
  async submitComputeJob(body: SubmitJobBody): Promise<SubmitJobResponse> {
    return await this.json<SubmitJobResponse>('/v1/compute/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /** GET /v1/compute/jobs/:jobId */
  async getComputeJob(jobId: string): Promise<GetJobResponse> {
    return await this.json<GetJobResponse>(`/v1/compute/jobs/${encodeURIComponent(jobId)}`);
  }

  /** GET /v1/compute/jobs */
  async listComputeJobs(): Promise<ComputeJobListItem[]> {
    return await this.json<ComputeJobListItem[]>('/v1/compute/jobs');
  }

  /** POST /v1/compute/jobs/:jobId/cancel */
  async cancelComputeJob(jobId: string): Promise<CancelJobResponse> {
    return await this.json<CancelJobResponse>(`/v1/compute/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
  }

  /** GET /v1/compute/jobs/:jobId/result */
  async getComputeJobResult(jobId: string): Promise<JobResultResponse> {
    return await this.json<JobResultResponse>(`/v1/compute/jobs/${encodeURIComponent(jobId)}/result`);
  }

  // --- Revenue API (Phase 3) ---

  async listRevenuePrograms(machineId?: string): Promise<Array<{
    id: string;
    machineId: string;
    shareBps: number;
    revenueScope: string;
    startAt: string;
    endAt: string;
    settlementCycle: string;
    status: string;
  }>> {
    const qs = machineId ? `?machineId=${encodeURIComponent(machineId)}` : '';
    return await this.json(`/v1/revenue/programs${qs}`);
  }

  async listRevenueMarketListings(params?: {
    programId?: string;
    includeInactive?: boolean;
  }): Promise<Array<{
    id: string;
    listingType: string;
    status: string;
    active: boolean;
    priceJpyc: string;
    expiryAt: string | null;
    soldAt: string | null;
    createdAt: string;
    updatedAt: string;
    sellerUserId: string | null;
    sellerWalletAddress: string | null;
    buyerUserId: string | null;
    buyerWalletAddress: string | null;
    revenueRight: {
      id: string;
      revenueProgramId: string;
      onchainProgramId: string | null;
      amount1155: string | null;
      status: string;
      machineId: string;
      nodeId: string;
      machineName: string;
      venueName: string;
      settlementCycle: string;
      startAt: string;
      endAt: string;
    };
  }>> {
    const query = new URLSearchParams();
    if (params?.programId) query.set('programId', params.programId);
    if (typeof params?.includeInactive === 'boolean') {
      query.set('includeInactive', params.includeInactive ? 'true' : 'false');
    }
    return await this.json(`/v1/revenue/market/listings?${query.toString()}`);
  }

  async getRevenueMarketConfig(): Promise<{
    revenueRightAddress: string | null;
    jpycTokenAddress: string | null;
    escrowWallet: string | null;
    chainEnabled: boolean;
  }> {
    return await this.json('/v1/revenue/market/config');
  }

  async listMyRevenueMarketListings(): Promise<Array<{
    id: string;
    listingType: string;
    status: string;
    active: boolean;
    priceJpyc: string;
    expiryAt: string | null;
    soldAt: string | null;
    createdAt: string;
    updatedAt: string;
    sellerUserId: string | null;
    sellerWalletAddress: string | null;
    buyerUserId: string | null;
    buyerWalletAddress: string | null;
    revenueRight: {
      id: string;
      revenueProgramId: string;
      onchainProgramId: string | null;
      amount1155: string | null;
      status: string;
      machineId: string;
      nodeId: string;
      machineName: string;
      venueName: string;
      settlementCycle: string;
      startAt: string;
      endAt: string;
    };
  }>> {
    return await this.json('/v1/revenue/market/my-listings');
  }

  async createRevenueMarketListing(input: {
    revenueRightId: string;
    priceJpyc: string;
    expiryAt?: string;
    onchainTxHash: string;
    walletAddress?: string;
  }): Promise<{
    id: string;
    status: string;
    onchainTxHash: string;
  }> {
    return await this.json('/v1/revenue/market/listings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  async cancelRevenueMarketListing(
    listingId: string,
    input?: { walletAddress?: string },
  ): Promise<{
    id: string;
    status: string;
    transferTxHash: string;
  }> {
    return await this.json(`/v1/revenue/market/listings/${encodeURIComponent(listingId)}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    });
  }

  async buyRevenueMarketListing(
    listingId: string,
    input: { onchainPaymentTxHash: string; walletAddress?: string },
  ): Promise<{
    id: string;
    status: string;
    buyerUserId: string;
    soldAt: string;
    paymentTxHash: string;
    transferTxHash: string;
  }> {
    return await this.json(`/v1/revenue/market/listings/${encodeURIComponent(listingId)}/buy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  async settleRevenueMarketListing(
    listingId: string,
    input?: { walletAddress?: string },
  ): Promise<{
    id: string;
    status: string;
    buyerUserId: string;
    soldAt: string;
    transferTxHash: string | null;
  }> {
    return await this.json(`/v1/revenue/market/listings/${encodeURIComponent(listingId)}/settle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    });
  }

  async createRevenueProgram(input: {
    merchantId: string;
    machineId: string;
    shareBps: number;
    revenueScope: 'USAGE_ONLY' | 'COMPUTE_ONLY' | 'ALL';
    startAt: string;
    endAt: string;
    settlementCycle: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    payoutToken?: string;
    metadataUri?: string;
    investors: Array<{ holderUserId: string; amount1155: string }>;
  }): Promise<{ programId: string; status: string; investors: number }> {
    return await this.json('/v1/revenue/programs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  async approveRevenueProgram(
    programId: string,
    input?: { approverUserId?: string },
  ): Promise<{ programId: string; status: string }> {
    return await this.json(`/v1/revenue/programs/${encodeURIComponent(programId)}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    });
  }

  async issueRevenueProgram(
    programId: string,
    input?: { operatorUserId?: string },
  ): Promise<{
    programId: string;
    status: string;
    onchainProgramId: string;
    txHash: string;
    investorCount: number;
  }> {
    return await this.json(`/v1/revenue/programs/${encodeURIComponent(programId)}/issue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    });
  }

  async getRevenueProgram(programId: string): Promise<{
    id: string;
    machineId: string;
    shareBps: number;
    revenueScope: string;
    startAt: string;
    endAt: string;
    settlementCycle: string;
    status: string;
    revenueRights: Array<{
      id: string;
      amount1155: string | null;
      holderUserId: string | null;
      status: string;
    }>;
  }> {
    return await this.json(`/v1/revenue/programs/${encodeURIComponent(programId)}`);
  }

  async listMyRevenueRights(params: { userId?: string; walletAddress?: string }): Promise<Array<{
    id: string;
    revenueProgramId: string;
    holderUserId: string | null;
    onchainTokenId: string | null;
    onchainProgramId: string | null;
    amount1155: string | null;
    status: string;
    revenueProgram: {
      id: string;
      settlementCycle: string;
      startAt: string;
      endAt: string;
      status: string;
      machine: {
        id: string;
        machineId: string;
        venueId: string;
        localSerial: string | null;
        gpu: string | null;
        cpu: string | null;
        venue: { name: string } | null;
      };
    };
  }>> {
    const query = new URLSearchParams();
    if (params.userId) query.set('userId', params.userId);
    if (params.walletAddress) query.set('walletAddress', params.walletAddress);
    return await this.json(`/v1/revenue/my-rights?${query.toString()}`);
  }

  async listRevenueAllocations(programId: string): Promise<Array<{
    id: string;
    revenueProgramId: string;
    allocationPeriodStart: string;
    allocationPeriodEnd: string;
    totalAmountJpyc: string;
    allocationTxHash: string | null;
    onchainAllocationId: string | null;
    createdAt: string;
  }>> {
    return await this.json(`/v1/revenue/programs/${encodeURIComponent(programId)}/allocations`);
  }

  async listRevenueClaims(params: { userId?: string; walletAddress?: string }): Promise<Array<{
    id: string;
    revenueRightId: string;
    allocationId: string;
    claimedAmountJpyc: string;
    claimTxHash: string | null;
    claimedAt: string;
    revenueRight: { id: string; revenueProgramId: string };
    allocation: { id: string; revenueProgramId: string };
  }>> {
    const query = new URLSearchParams();
    if (params.userId) query.set('userId', params.userId);
    if (params.walletAddress) query.set('walletAddress', params.walletAddress);
    return await this.json(`/v1/revenue/claims?${query.toString()}`);
  }

  async claimRevenue(input: {
    revenueRightId: string;
    allocationId: string;
    onchainTxHash?: string;
    userId?: string;
    walletAddress?: string;
  }): Promise<{
    id: string;
    revenueRightId: string;
    allocationId: string;
    claimedAmountJpyc: string;
    claimTxHash: string | null;
    claimedAt: string;
  }> {
    return await this.json('/v1/revenue/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  }
}
