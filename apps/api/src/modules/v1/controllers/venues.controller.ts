import { Controller, Get, Param } from '@nestjs/common';
import { VenueService } from '../services/venue.service';

@Controller('/v1/venues')
export class VenuesController {
  constructor(private readonly venueService: VenueService) {}

  @Get()
  list() {
    return this.venueService.listVenues();
  }

  @Get('/:venueId/plans')
  plans(@Param('venueId') venueId: string) {
    return this.venueService.listUsageProductsByVenue(venueId);
  }
}
