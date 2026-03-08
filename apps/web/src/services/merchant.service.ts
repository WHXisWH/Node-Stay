/**
 * MerchantService: createVenue、upsertPlan、upsertSeat、enableCompute、createDispute（S8）.
 * No store; returns API results.
 */

import type { NodeStayClient } from '@nodestay/api-client';
import { createNodeStayClient } from './nodestay';

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

export const MerchantService = {
  async createVenue(input: CreateVenueInput, client?: NodeStayClient) {
    const c = client ?? createNodeStayClient();
    return await c.createVenueAsMerchant(input);
  },

  async upsertUsageProduct(venueId: string, input: UpsertUsageProductInput, client?: NodeStayClient) {
    const c = client ?? createNodeStayClient();
    return await c.upsertUsageProduct(venueId, input);
  },

  async upsertSeat(venueId: string, input: UpsertSeatInput, client?: NodeStayClient) {
    const c = client ?? createNodeStayClient();
    return await c.upsertSeat(venueId, { seatId: input.seatId, type: input.type, status: input.status });
  },

  async enableCompute(venueId: string, enable: boolean, client?: NodeStayClient) {
    const c = client ?? createNodeStayClient();
    return await c.enableCompute(venueId, enable);
  },

  async createDispute(input: CreateDisputeInput, client?: NodeStayClient) {
    const c = client ?? createNodeStayClient();
    return await c.createDispute(input);
  },
};
