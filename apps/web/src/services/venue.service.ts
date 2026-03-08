/**
 * VenueService: 店舗/プランデータを取得して venue.store に格納する（SPEC §8.1）。
 * Controller は Store を読み取り、データ取得は本 Service 経由で実行する。
 */

import { createNodeStayClient } from './nodestay';
import { getVenueStore, setVenueStore } from '../stores/venue.store';
import type { VenueSortBy } from '../stores/venue.store';

export const VenueService = {
  setQuery(query: string) {
    setVenueStore({ query });
  },

  setSortBy(sortBy: VenueSortBy) {
    setVenueStore({ sortBy });
  },

  /** 店舗一覧を取得して store に格納（生データ）。フィルタ/ソートは Controller 側で実施。 */
  async listVenues(): Promise<void> {
    setVenueStore({ loading: true });
    const minDelay = new Promise((r) => setTimeout(r, 600));
    try {
      const client = createNodeStayClient();
      const [venues] = await Promise.all([client.listVenues(), minDelay]);
      setVenueStore({ venues, loading: false, error: null });
    } catch (e) {
      await minDelay;
      setVenueStore({
        loading: false,
        error: e instanceof Error ? e.message : '取得に失敗しました',
      });
    }
  },

  async loadVenueDetail(venueId: string): Promise<void> {
    setVenueStore({ plansLoading: true, plansError: null });
    try {
      const client = createNodeStayClient();
      const [venues, plans] = await Promise.all([
        client.listVenues(),
        client.listUsageProducts(venueId),
      ]);
      const venue = venues.find((v) => v.venueId === venueId) ?? null;
      setVenueStore({
        currentVenue: venue,
        plans,
        plansLoading: false,
        plansError: null,
      });
    } catch (e) {
      setVenueStore({
        plansLoading: false,
        plansError: e instanceof Error ? e.message : '取得に失敗しました',
      });
    }
  },
};
