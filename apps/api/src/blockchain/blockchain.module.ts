import { Global, Module } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { MachineRegistryContractService } from './machine-registry.contract.service';
import { UsageRightContractService } from './usage-right.contract.service';
import { SettlementContractService } from './settlement.contract.service';
import { RevenueRightContractService } from './revenue-right.contract.service';
import { ComputeRightContractService } from './compute-right.contract.service';
import { BlockchainListenerService } from './blockchain-listener.service';

@Global()
@Module({
  providers: [
    BlockchainService,
    MachineRegistryContractService,
    UsageRightContractService,
    SettlementContractService,
    RevenueRightContractService,
    ComputeRightContractService,
    BlockchainListenerService,
  ],
  exports: [
    BlockchainService,
    MachineRegistryContractService,
    UsageRightContractService,
    SettlementContractService,
    RevenueRightContractService,
    ComputeRightContractService,
  ],
})
export class BlockchainModule {}
