import { Controller, Get, Param } from '@nestjs/common';
import { VenueService } from '../services/venue.service';
import { Public } from '../decorators/public.decorator';

@Controller('/v1/venues')
export class VenuesController {
  constructor(private readonly venueService: VenueService) {}

  @Public()
  @Get()
  list() {
    return this.venueService.listVenues();
  }

  @Public()
  @Get('/:venueId/plans')
  plans(@Param('venueId') venueId: string) {
    return this.venueService.listUsageProductsByVenue(venueId);
  }
}
