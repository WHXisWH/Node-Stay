import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './controllers/health.controller';
import { PassesController } from './controllers/passes.controller';
import { IdentityController } from './controllers/identity.controller';
import { SessionsController } from './controllers/sessions.controller';
import { UserController } from './controllers/user.controller';
import { VenuesController } from './controllers/venues.controller';
import { MerchantController } from './controllers/merchant.controller';
import { ComputeController } from './controllers/compute.controller';
import { MachineController } from './controllers/machine.controller';
import { AuthController } from './controllers/auth.controller';
import { MarketplaceController } from './controllers/marketplace.controller';
import { RevenueController } from './controllers/revenue.controller';
import { IdempotencyService } from './services/idempotency.service';
import { LedgerService } from './services/ledger.service';
import { FeatureFlagsService } from './services/featureFlags.service';
import { VenueService } from './services/venue.service';
import { UsageRightService } from './services/usage-right.service';
import { SessionService } from './services/session.service';
import { ComputeService } from './services/compute.service';
import { MachineService } from './services/machine.service';
import { AuthService } from './services/auth.service';
import { ListingService } from './services/listing.service';
import { RevenueService } from './services/revenue.service';
import { RevenueAllocationService } from './services/revenue-allocation.service';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';

@Module({
  controllers: [
    HealthController,
    VenuesController,
    PassesController,
    IdentityController,
    SessionsController,
    UserController,
    MerchantController,
    ComputeController,
    MachineController,
    AuthController,
    MarketplaceController,
    RevenueController,
  ],
  providers: [
    FeatureFlagsService,
    IdempotencyService,
    LedgerService,
    VenueService,
    UsageRightService,
    SessionService,
    ComputeService,
    MachineService,
    AuthService,
    ListingService,
    RevenueService,
    RevenueAllocationService,
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class V1Module {}
