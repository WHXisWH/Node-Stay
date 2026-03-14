/**
 * MerchantService:
 * 取得データを merchant.store に反映し、書き込み系処理（createVenue/upsert など）は API 結果を返す。
 * クラス内で client を保持し、createNodeStayClient() の重複生成を避ける。
 */

import type { NodeStayClient } from '@nodestay/api-client';
import { createNodeStayClient } from './nodestay';
import { getMerchantStore } from '../stores/merchant.store';
import type {
  ManagedNode,
  MerchantMachineClass,
  MerchantMachineDetail,
  MerchantMachineDetailStatus,
  MerchantMachineItem,
  MerchantRevenueMachineOption,
  MerchantRevenueProgramItem,
  MerchantSlotWindow,
  MerchantUsageProductItem,
  MerchantVenueItem,
} from '../models/merchant.model';

export interface CreateVenueInput {
  name: string;
  address: string;
  timezone: string;
}

export interface UpsertUsageProductInput {
  productName: string;
  usageType: 'HOURLY' | 'PACK' | 'NIGHT' | 'FLEX';
  durationMinutes: number;
  priceJpyc: string;
  transferable?: boolean;
  maxTransferCount?: number;
}

export interface UpsertSeatInput {
  seatId?: string;
  type: 'OPEN' | 'BOOTH' | 'FLAT' | 'VIP';
  status?: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'COMPUTE_MODE';
}

export interface CreateDisputeInput {
  venueId: string;
  reason: string;
}

const MACHINE_CLASSES: MerchantMachineClass[] = ['GPU', 'CPU', 'PREMIUM', 'STANDARD'];
const MACHINE_STATUSES: MerchantMachineItem['status'][] = ['REGISTERED', 'ACTIVE', 'PAUSED', 'MAINTENANCE', 'DECOMMISSIONED'];
const DETAIL_STATUSES: MerchantMachineDetailStatus[] = ['REGISTERED', 'ACTIVE', 'PAUSED', 'MAINTENANCE', 'DECOMMISSIONED'];

function toMachineClass(v: string): MerchantMachineClass {
  return MACHINE_CLASSES.includes(v as MerchantMachineClass) ? (v as MerchantMachineClass) : 'STANDARD';
}

function toMachineStatus(v: string): MerchantMachineItem['status'] {
  return MACHINE_STATUSES.includes(v as MerchantMachineItem['status']) ? (v as MerchantMachineItem['status']) : 'REGISTERED';
}

function toDetailStatus(v: string): MerchantMachineDetailStatus {
  return DETAIL_STATUSES.includes(v as MerchantMachineDetailStatus) ? (v as MerchantMachineDetailStatus) : 'REGISTERED';
}

class MerchantServiceClass {
  private _client: NodeStayClient | null = null;

  private get client(): NodeStayClient {
    if (!this._client) this._client = createNodeStayClient();
    return this._client;
  }

  async loadVenues(): Promise<void> {
    const store = getMerchantStore();
    store.setLoading(true);
    store.setError(null);
    try {
      const rows = await this.client.listVenues();
      const venues: MerchantVenueItem[] = rows.map((v) => ({
        venueId: v.venueId,
        name: v.name,
        address: v.address,
        timezone: v.timezone,
      }));
      store.setVenues(venues);
    } catch (e) {
      store.setError(e instanceof Error ? e.message : 'Failed to load venues');
    } finally {
      store.setLoading(false);
    }
  }

  async loadMachines(venueId?: string): Promise<void> {
    const store = getMerchantStore();
    let targetVenueId = venueId;
    if (!targetVenueId) {
      const venues = store.venues;
      if (venues.length === 0) {
        await this.loadVenues();
        targetVenueId = getMerchantStore().venues[0]?.venueId;
      } else {
        targetVenueId = venues[0].venueId;
      }
    }
    if (!targetVenueId) return;

    store.setLoading(true);
    store.setError(null);
    try {
      const raw = await this.client.listMachines({ venueId: targetVenueId });
      const machines: MerchantMachineItem[] = raw.map((m) => ({
        id: m.id,
        machineId: m.machineId,
        venueId: m.venueId,
        machineClass: toMachineClass(m.machineClass),
        label: `${m.machineClass} - ${m.machineId?.slice(0, 8) ?? ''}`,
        cpu: m.cpu ?? '',
        gpu: m.gpu ?? null,
        ramGb: m.ramGb ?? 0,
        storageGb: m.storageGb ?? 0,
        status: toMachineStatus(m.status),
        onchainTokenId: m.onchainTokenId ?? null,
        sessionsTotal: 0,
        earningsTotalMinor: 0,
      }));
      store.setMachines(machines);
    } catch (e) {
      store.setError(e instanceof Error ? e.message : 'Failed to load machines');
    } finally {
      store.setLoading(false);
    }
  }

  /** POST /v1/machines — 登録後に loadMachines で一覧を更新 */
  async registerMachine(input: {
    venueId: string;
    machineClass: string;
    cpu?: string;
    gpu?: string;
    ramGb?: number;
    storageGb?: number;
    localSerial?: string;
    metadataUri?: string;
  }): Promise<{ id: string; machineId: string; status: string }> {
    const result = await this.client.registerMachine(input);
    await this.loadMachines(input.venueId);
    return result;
  }

  async loadDashboard(): Promise<void> {
    const store = getMerchantStore();
    store.setLoading(true);
    store.setError(null);
    try {
      const [venues, rawMachines] = await Promise.all([
        this.client.listVenues(),
        this.client.listMachines(),
      ]);
      const venueList: MerchantVenueItem[] = venues.map((v) => ({
        venueId: v.venueId,
        name: v.name,
        address: v.address,
        timezone: v.timezone,
      }));
      store.setVenues(venueList);
      const firstVenueId = venueList[0]?.venueId;
      const forVenue = firstVenueId ? rawMachines.filter((m) => m.venueId === firstVenueId) : rawMachines;
      const machines: MerchantMachineItem[] = forVenue.map((m) => ({
        id: m.id,
        machineId: m.machineId,
        venueId: m.venueId,
        machineClass: toMachineClass(m.machineClass),
        label: `${m.machineClass} - ${m.machineId?.slice(0, 8) ?? ''}`,
        cpu: m.cpu ?? '',
        gpu: m.gpu ?? null,
        ramGb: m.ramGb ?? 0,
        storageGb: m.storageGb ?? 0,
        status: toMachineStatus(m.status),
        onchainTokenId: m.onchainTokenId ?? null,
        sessionsTotal: 0,
        earningsTotalMinor: 0,
      }));
      store.setMachines(machines);
    } catch (e) {
      store.setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      store.setLoading(false);
    }
  }

  async loadUsageProducts(venueId?: string): Promise<void> {
    const store = getMerchantStore();
    let targetVenueId = venueId;
    if (!targetVenueId) {
      if (store.venues.length === 0) await this.loadVenues();
      targetVenueId = getMerchantStore().venues[0]?.venueId;
    }
    if (!targetVenueId) return;

    store.setLoading(true);
    store.setError(null);
    try {
      const raw = await this.client.listUsageProducts(targetVenueId);
      const products: MerchantUsageProductItem[] = raw.map((p) => ({
        id: p.productId,
        name: p.name,
        usageType: 'SEAT_TIME',
        durationMinutes: p.baseDurationMinutes,
        priceMinor: p.basePriceMinor,
        depositRequiredMinor: p.depositRequiredMinor,
        transferable: true,
        maxTransferCount: 1,
        status: 'ACTIVE',
        soldCount: 0,
        venueId: p.venueId,
        machineId: null,
      }));
      store.setUsageProducts(products);
    } catch (e) {
      store.setError(e instanceof Error ? e.message : 'Failed to load usage products');
    } finally {
      store.setLoading(false);
    }
  }

  async loadComputeNodes(venueId?: string): Promise<void> {
    const store = getMerchantStore();
    let targetVenueId = venueId;
    if (!targetVenueId) {
      if (store.venues.length === 0) await this.loadVenues();
      targetVenueId = getMerchantStore().venues[0]?.venueId;
    }
    if (!targetVenueId) return;

    store.setLoading(true);
    store.setError(null);
    try {
      const [venues, raw] = await Promise.all([
        this.client.listVenues(),
        this.client.listMachines({ venueId: targetVenueId }),
      ]);
      const venueName = venues.find((v) => v.venueId === targetVenueId)?.name ?? '';
      const nodes: ManagedNode[] = raw.map((m) => ({
        nodeId: m.id,
        seatId: m.machineId ?? '',
        seatLabel: `${m.machineClass} - ${m.machineId?.slice(0, 8) ?? ''}`,
        specs: {
          cpuModel: m.cpu ?? '',
          cpuCores: 0,
          gpuModel: m.gpu ?? '',
          vram: 0,
          ram: m.ramGb ?? 0,
        },
        status: 'IDLE',
        enabled: m.status === 'ACTIVE',
        configured: true,
        pricePerHourMinor: 100000,
        minBookingHours: 1,
        maxBookingHours: 8,
        supportedTasks: ['GENERAL'],
        availableWindows: [],
        earnings: { thisMonthMinor: 0, totalMinor: 0, completedJobs: 0, uptimePercent: 0 },
      }));
      store.setComputeNodes(nodes);
      store.setVenues(venues.map((v) => ({ venueId: v.venueId, name: v.name, address: v.address, timezone: v.timezone })));
    } catch (e) {
      store.setError(e instanceof Error ? e.message : 'Failed to load compute nodes');
    } finally {
      store.setLoading(false);
    }
  }

  async loadRevenuePrograms(): Promise<void> {
    const store = getMerchantStore();
    store.setLoading(true);
    store.setError(null);
    try {
      const [apiMachines, apiPrograms] = await Promise.all([
        this.client.listMachines(),
        this.client.listRevenuePrograms(),
      ]);
      const programs: MerchantRevenueProgramItem[] = apiPrograms.map((p) => ({
        id: p.id,
        machineId: p.machineId,
        shareBps: p.shareBps,
        revenueScope: p.revenueScope,
        startAt: p.startAt,
        endAt: p.endAt,
        settlementCycle: p.settlementCycle,
        status: p.status,
      }));
      const options: MerchantRevenueMachineOption[] = apiMachines.map((m) => ({
        id: m.id,
        machineId: m.machineId,
        machineClass: m.machineClass,
        status: m.status,
        localLabel: `${m.machineClass} / ${m.machineId.slice(0, 10)}...`,
      }));
      store.setRevenuePrograms(programs);
      store.setRevenueProgramsMachines(options);
    } catch (e) {
      store.setError(e instanceof Error ? e.message : 'Failed to load revenue programs');
    } finally {
      store.setLoading(false);
    }
  }

  async loadMachineDetail(machineId: string): Promise<void> {
    const store = getMerchantStore();
    if (!machineId) {
      store.setMachineDetail(null);
      store.setMachineDetailNotFound(false);
      return;
    }
    store.setMachineDetailLoading(true);
    store.setMachineDetailNotFound(false);
    try {
      const data = await this.client.getMachine(machineId);
      const machineClass = toMachineClass(data.machineClass);
      const detail: MerchantMachineDetail = {
        id: data.id,
        machineId: data.machineId,
        venueId: data.venueId,
        venueName: data.venue?.name ?? '',
        venueAddress: '',
        machineClass,
        label: `${machineClass} - ${data.machineId?.slice(0, 8) ?? ''}`,
        spec: {
          cpu: data.cpu ?? null,
          gpu: data.gpu ?? null,
          ramGb: data.ramGb ?? null,
          storageGb: data.storageGb ?? null,
        },
        status: toDetailStatus(data.status),
        onchainTokenId: data.onchainTokenId ?? null,
        onchainTxHash: (data as { onchainTxHash?: string | null }).onchainTxHash ?? null,
        computeEnabled: false,
        sessionsTotal: 0,
        earningsTotalMinor: 0,
      };
      store.setMachineDetail(detail);
    } catch {
      store.setMachineDetail(null);
      store.setMachineDetailNotFound(true);
    } finally {
      store.setMachineDetailLoading(false);
    }
  }

  async loadMachineSlots(machineId: string, fromIso: string, toIso: string): Promise<void> {
    const store = getMerchantStore();
    if (!machineId) {
      store.setMachineSlots([]);
      return;
    }
    store.setMachineSlotsLoading(true);
    try {
      const data = await this.client.getMachineSlots(machineId, { from: fromIso, to: toIso });
      const slots: MerchantSlotWindow[] = data.map((s) => ({
        from: s.slotStart,
        to: s.slotEnd,
        status:
          s.occupancyStatus === 'OCCUPIED' ? 'OCCUPIED'
          : s.occupancyStatus === 'AVAILABLE' ? 'AVAILABLE'
          : 'BLOCKED',
        slotType: s.slotType === 'COMPUTE' ? 'COMPUTE' : 'USAGE',
      }));
      store.setMachineSlots(slots);
    } catch {
      store.setMachineSlots([]);
    } finally {
      store.setMachineSlotsLoading(false);
    }
  }

  async updateMachineStatus(id: string, status: string): Promise<void> {
    await this.client.updateMachineStatus(id, status);
    const store = getMerchantStore();
    const machines = store.machines.map((m) => (m.id === id ? { ...m, status: toMachineStatus(status) } : m));
    store.setMachines(machines);
  }

  async createVenue(input: CreateVenueInput) {
    return await this.client.createVenueAsMerchant(input);
  }

  async upsertUsageProduct(venueId: string, input: UpsertUsageProductInput) {
    return await this.client.upsertUsageProduct(venueId, input);
  }

  async upsertSeat(venueId: string, input: UpsertSeatInput) {
    return await this.client.upsertSeat(venueId, { seatId: input.seatId, type: input.type, status: input.status });
  }

  async enableCompute(venueId: string, enable: boolean) {
    return await this.client.enableCompute(venueId, enable);
  }

  async createDispute(input: CreateDisputeInput) {
    return await this.client.createDispute(input);
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
  }) {
    return await this.client.createRevenueProgram(input);
  }

  async approveRevenueProgram(programId: string, input?: { approverUserId?: string }) {
    return await this.client.approveRevenueProgram(programId, input);
  }

  async issueRevenueProgram(programId: string, input?: { operatorUserId?: string }) {
    return await this.client.issueRevenueProgram(programId, input);
  }

  /** 算力ノードの enabled を Store 上でトグル（UI 即時反映） */
  toggleComputeNode(nodeId: string): void {
    const store = getMerchantStore();
    const nodes = store.computeNodes.map((n) =>
      n.nodeId === nodeId
        ? { ...n, enabled: !n.enabled, status: (!n.enabled ? 'IDLE' : 'OFFLINE') as ManagedNode['status'] }
        : n
    );
    store.setComputeNodes(nodes);
  }

  /** 単一ノードを Store 上で更新（handleSave の編集反映用） */
  updateComputeNodeInStore(nodeId: string, patch: Partial<ManagedNode>): void {
    const store = getMerchantStore();
    const nodes = store.computeNodes.map((n) => (n.nodeId === nodeId ? { ...n, ...patch } : n));
    store.setComputeNodes(nodes);
  }

  /** 新規ノードを Store に追加（マシン登録 API 別途のため Store のみ） */
  addComputeNodeToStore(node: ManagedNode): void {
    const store = getMerchantStore();
    store.setComputeNodes([...store.computeNodes, node]);
  }

  /** ステータス個別変更 API 未実装のため Store のみ更新 */
  toggleUsageProductStatus(productId: string): void {
    const store = getMerchantStore();
    const products = store.usageProducts.map((p) =>
      p.id === productId
        ? { ...p, status: (p.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE') as MerchantUsageProductItem['status'] }
        : p
    );
    store.setUsageProducts(products);
  }
}

export const MerchantService = new MerchantServiceClass();
