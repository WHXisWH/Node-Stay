/**
 * MarketplaceSyncOutboxService
 * チェーン確定後のバックエンド反映を非同期キューで再試行する（P2）。
 */

import { MarketplaceService } from './marketplace.service';

type SyncTaskType = 'BUY_LISTING' | 'CREATE_LISTING' | 'CANCEL_LISTING';

interface BaseTask<TType extends SyncTaskType, TPayload> {
  id: string;
  type: TType;
  payload: TPayload;
  attempts: number;
  nextRetryAt: number;
  createdAt: number;
  updatedAt: number;
  lastError: string | null;
}

type BuyListingTask = BaseTask<'BUY_LISTING', {
  listingId: string;
  buyerUserId: string;
  buyerWallet?: string;
  onchainTxHash: string;
  idempotencyKey: string;
}>;

type CreateListingTask = BaseTask<'CREATE_LISTING', {
  usageRightId: string;
  sellerUserId: string;
  priceJpyc: string;
  expiryAt?: string;
  onchainTxHash: string;
  idempotencyKey: string;
}>;

type CancelListingTask = BaseTask<'CANCEL_LISTING', {
  listingId: string;
  userId: string;
  onchainTxHash: string;
  idempotencyKey: string;
}>;

type SyncTask = BuyListingTask | CreateListingTask | CancelListingTask;

export interface MarketplaceSyncOutboxSummary {
  pendingCount: number;
  lastError: string | null;
}

export interface EnqueueResult {
  state: 'synced' | 'queued' | 'failed';
  message?: string;
}

const STORAGE_KEY = 'nodestay.marketplace.sync.outbox.v1';
const MAX_ATTEMPTS = 8;
const BASE_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;

function now(): number {
  return Date.now();
}

function ensureIdempotencyKey(input: string | undefined, fallbackSeed: string): string {
  const source = input && input.trim() ? input : fallbackSeed;
  const normalized = source.replace(/[^a-zA-Z0-9_-]/g, '-');
  return normalized.length >= 12 ? normalized.slice(0, 96) : `sync-${normalized}-${Date.now()}`;
}

function parseErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '同期処理に失敗しました。';
}

function isNetworkErrorMessage(message: string): boolean {
  return /failed to fetch|network|load failed|err_connection_refused|timed out|timeout/i.test(message);
}

function isTerminalSuccessError(task: SyncTask, message: string): boolean {
  if (task.type === 'BUY_LISTING') {
    return (
      message.includes('アクティブな出品のみ購入できます') ||
      message.includes('リスティングが見つかりません')
    );
  }
  if (task.type === 'CREATE_LISTING') {
    return message.includes('既にアクティブな出品があります');
  }
  return (
    message.includes('アクティブな出品のみキャンセルできます') ||
    message.includes('リスティングが見つかりません')
  );
}

function isTerminalFailureError(message: string): boolean {
  return [
    '入力が不正',
    '同一キーで内容が異なります',
    'この利用権の所有者ではありません',
    'この出品のキャンセル権限がありません',
    'この利用権は譲渡不可',
    '自分のリスティングは購入できません',
    'Idempotency-Key',
  ].some((keyword) => message.includes(keyword));
}

function computeRetryDelay(attempts: number): number {
  const exp = BASE_RETRY_MS * Math.pow(2, attempts);
  return Math.min(MAX_RETRY_MS, exp);
}

class MarketplaceSyncOutboxServiceClass {
  private queue: SyncTask[] = [];
  private loaded = false;
  private inFlight = false;
  private lastError: string | null = null;
  private readonly listeners = new Set<(summary: MarketplaceSyncOutboxSummary) => void>();

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SyncTask[];
      if (Array.isArray(parsed)) {
        this.queue = parsed;
      }
    } catch {
      this.queue = [];
    }
    this.emit();
  }

  private persist(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
  }

  private emit(): void {
    const summary = this.getSummary();
    for (const listener of this.listeners) {
      listener(summary);
    }
  }

  private removeTask(taskId: string): void {
    this.queue = this.queue.filter((item) => item.id !== taskId);
  }

  private async executeTask(task: SyncTask): Promise<'synced' | 'queued' | 'failed'> {
    try {
      if (task.type === 'BUY_LISTING') {
        await MarketplaceService.buyListing(
          task.payload.listingId,
          task.payload.buyerUserId,
          task.payload.buyerWallet,
          task.payload.onchainTxHash,
          ensureIdempotencyKey(task.payload.idempotencyKey, `buy-${task.id}`),
        );
      } else if (task.type === 'CREATE_LISTING') {
        await MarketplaceService.createListing(task.payload);
      } else {
        await MarketplaceService.cancelListing(
          task.payload.listingId,
          task.payload.userId,
          task.payload.onchainTxHash,
          ensureIdempotencyKey(task.payload.idempotencyKey, `cancel-${task.id}`),
        );
      }
      this.lastError = null;
      return 'synced';
    } catch (error) {
      const message = parseErrorMessage(error);

      if (isTerminalSuccessError(task, message)) {
        this.lastError = null;
        return 'synced';
      }

      if (isTerminalFailureError(message)) {
        this.lastError = message;
        return 'failed';
      }

      task.attempts += 1;
      task.lastError = message;
      task.updatedAt = now();

      if (task.attempts >= MAX_ATTEMPTS) {
        this.lastError = message;
        return 'failed';
      }

      const delay = isNetworkErrorMessage(message)
        ? computeRetryDelay(task.attempts)
        : computeRetryDelay(task.attempts + 1);
      task.nextRetryAt = now() + delay;
      this.lastError = message;
      return 'queued';
    }
  }

  async flush(): Promise<MarketplaceSyncOutboxSummary> {
    this.ensureLoaded();
    if (this.inFlight) return this.getSummary();

    this.inFlight = true;
    try {
      let progressed = true;
      while (progressed) {
        progressed = false;
        const dueTasks = this.queue.filter((task) => task.nextRetryAt <= now());
        for (const task of dueTasks) {
          const result = await this.executeTask(task);
          progressed = true;
          if (result === 'synced' || result === 'failed') {
            this.removeTask(task.id);
          }
          this.persist();
          this.emit();
        }
      }
      return this.getSummary();
    } finally {
      this.inFlight = false;
    }
  }

  private async enqueueTask(task: SyncTask): Promise<EnqueueResult> {
    this.ensureLoaded();
    this.queue.push(task);
    this.persist();
    this.emit();

    const result = await this.executeTask(task);
    if (result === 'synced' || result === 'failed') {
      this.removeTask(task.id);
    }
    this.persist();
    this.emit();

    if (result === 'synced') return { state: 'synced' };
    if (result === 'queued') return { state: 'queued', message: task.lastError ?? undefined };
    return { state: 'failed', message: task.lastError ?? 'バックエンド同期に失敗しました。' };
  }

  async enqueueBuyListing(payload: BuyListingTask['payload']): Promise<EnqueueResult> {
    const timestamp = now();
    return this.enqueueTask({
      id: `buy:${payload.listingId}:${payload.onchainTxHash}`,
      type: 'BUY_LISTING',
      payload,
      attempts: 0,
      nextRetryAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastError: null,
    });
  }

  async enqueueCreateListing(payload: CreateListingTask['payload']): Promise<EnqueueResult> {
    const timestamp = now();
    return this.enqueueTask({
      id: `create:${payload.usageRightId}:${payload.onchainTxHash}`,
      type: 'CREATE_LISTING',
      payload,
      attempts: 0,
      nextRetryAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastError: null,
    });
  }

  async enqueueCancelListing(payload: CancelListingTask['payload']): Promise<EnqueueResult> {
    const timestamp = now();
    return this.enqueueTask({
      id: `cancel:${payload.listingId}:${payload.onchainTxHash}`,
      type: 'CANCEL_LISTING',
      payload,
      attempts: 0,
      nextRetryAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastError: null,
    });
  }

  subscribe(listener: (summary: MarketplaceSyncOutboxSummary) => void): () => void {
    this.ensureLoaded();
    this.listeners.add(listener);
    listener(this.getSummary());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSummary(): MarketplaceSyncOutboxSummary {
    this.ensureLoaded();
    return {
      pendingCount: this.queue.length,
      lastError: this.lastError,
    };
  }
}

export const MarketplaceSyncOutboxService = new MarketplaceSyncOutboxServiceClass();
