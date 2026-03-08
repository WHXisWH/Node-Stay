import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { V1Module } from './v1/v1.module';

@Module({
  imports: [
    PrismaModule,
    BlockchainModule,
    V1Module,
  ],
})
export class AppModule {}
