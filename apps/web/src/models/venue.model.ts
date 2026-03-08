/**
 * Venue & Plan model types.
 * Aligned with @nodestay/api-client listVenues / listPlans responses.
 */

/** List item from GET /v1/venues */
export interface VenueListItem {
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
}

/** List item from GET /v1/venues/:venueId/plans */
export interface PlanListItem {
  productId: string;
  venueId: string;
  name: string;
  baseDurationMinutes: number;
  basePriceMinor: number;
  depositRequiredMinor: number;
}

/** Alias for list display */
export type Venue = VenueListItem;
export type Plan = PlanListItem;
