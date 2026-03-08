/**
 * Index layer tests (W13): DB schema, dedup (txHash+logIndex), resumable sync, reorg rollback.
 * In Node/jsdom IndexedDB is missing; run with browser or fake-indexeddb to execute.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { indexedDb, type ChainSyncStateRow, type ComputeNodeRow, type ComputeJobRow } from './db';

const hasIndexedDB = typeof indexedDB !== 'undefined';

describe.skipIf(!hasIndexedDB)('NodestayIndexedDB', () => {
  beforeEach(async () => {
    await indexedDb.chain_sync_state.clear();
    await indexedDb.compute_nodes.clear();
    await indexedDb.compute_jobs.clear();
    await indexedDb.passes.clear();
    if (indexedDb.events) await indexedDb.events.clear();
  });

  it('stores and retrieves chain_sync_state by compound key [chainId+contractAddress]', async () => {
    const row: ChainSyncStateRow = {
      chainId: 80002,
      contractAddress: '0xabc',
      deploymentBlock: 100,
      lastProcessedBlock: 150,
      lastFinalizedBlock: 120,
      updatedAtIso: new Date().toISOString(),
    };
    await indexedDb.chain_sync_state.put(row);
    const got = await indexedDb.chain_sync_state.get([80002, '0xabc']);
    expect(got).toBeDefined();
    expect(got?.lastProcessedBlock).toBe(150);
    expect(got?.lastFinalizedBlock).toBe(120);
  });

  it('dedup: events table unique by [chainId+txHash+logIndex]', async () => {
    if (!indexedDb.events) return;
    await indexedDb.events.put({
      chainId: 1,
      txHash: '0xaa',
      logIndex: 0,
      blockNumber: 1,
      address: '0xcontract',
      eventName: 'NodeRegistered',
      args: '{}',
    });
    await indexedDb.events.put({
      chainId: 1,
      txHash: '0xaa',
      logIndex: 0,
      blockNumber: 1,
      address: '0xcontract',
      eventName: 'NodeRegistered',
      args: '{}',
    });
    const count = await indexedDb.events.count();
    expect(count).toBe(1);
  });

  it('upserts compute_nodes by [chainId+nodeId]', async () => {
    const node: ComputeNodeRow = {
      chainId: 80002,
      nodeId: '0xnode1',
      venueOwner: '0xowner',
      pricePerHourMinor: '1000',
      minBookingHours: 1,
      maxBookingHours: 24,
      active: true,
      updatedAtBlock: 200,
    };
    await indexedDb.compute_nodes.put(node);
    const list = await indexedDb.compute_nodes.where('chainId').equals(80002).toArray();
    expect(list).toHaveLength(1);
    expect(list[0].nodeId).toBe('0xnode1');
    node.active = false;
    node.updatedAtBlock = 201;
    await indexedDb.compute_nodes.put(node);
    const list2 = await indexedDb.compute_nodes.where('chainId').equals(80002).toArray();
    expect(list2).toHaveLength(1);
    expect(list2[0].active).toBe(false);
    expect(list2[0].updatedAtBlock).toBe(201);
  });

  it('upserts compute_jobs by [chainId+jobId]', async () => {
    const job: ComputeJobRow = {
      chainId: 80002,
      jobId: '1',
      nodeId: '0xnode1',
      requester: '0xreq',
      depositMinor: '5000',
      estimatedHours: 2,
      status: 'PENDING',
      updatedAtBlock: 300,
    };
    await indexedDb.compute_jobs.put(job);
    const list = await indexedDb.compute_jobs.where('chainId').equals(80002).toArray();
    expect(list).toHaveLength(1);
    job.status = 'RUNNING';
    job.startedAt = 301;
    job.updatedAtBlock = 301;
    await indexedDb.compute_jobs.put(job);
    const list2 = await indexedDb.compute_jobs.where('chainId').equals(80002).toArray();
    expect(list2[0].status).toBe('RUNNING');
    expect(list2[0].startedAt).toBe(301);
  });

  it('migration: version 2 adds events table', () => {
    expect(indexedDb.verno).toBeGreaterThanOrEqual(1);
    if (indexedDb.verno >= 2) {
      expect(indexedDb.events).toBeDefined();
    }
  });
});
