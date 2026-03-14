import { HttpException } from '@nestjs/common';
import { MachineService } from './machine.service';

describe('MachineService.register ownership and onchain handling', () => {
  const buildService = (opts?: {
    strict?: boolean;
    ownerUserId?: string | null;
    onchainResult?: { machineId: string; tokenId: string; txHash: string } | null;
  }) => {
    const strict = opts?.strict ?? true;
    const ownerUserId = opts?.ownerUserId ?? null;
    const onchainResult = opts?.onchainResult ?? null;

    const prismaMock: any = {
      venue: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'venue-1',
          merchant: { id: 'merchant-1', ownerUserId },
        }),
      },
      merchant: {
        update: jest.fn().mockResolvedValue({ id: 'merchant-1' }),
      },
      machine: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'machine-db-id',
          ...data,
        })),
      },
    };

    const registryMock: any = {
      registerMachine: jest.fn().mockResolvedValue(onchainResult),
    };

    const flagsMock: any = {
      strictOnchainModeEnabled: jest.fn().mockReturnValue(strict),
    };

    const userServiceMock: any = {
      findOrCreateByWallet: jest.fn().mockResolvedValue('actor-user-id'),
    };

    const service = new MachineService(
      prismaMock,
      registryMock,
      flagsMock,
      userServiceMock,
    );

    return { service, prismaMock, registryMock, flagsMock, userServiceMock };
  };

  it('owner 不一致なら 403 を返す', async () => {
    const { service } = buildService({
      ownerUserId: 'other-user-id',
      strict: true,
      onchainResult: {
        machineId: '0x' + '1'.repeat(64),
        tokenId: '1',
        txHash: '0x' + '2'.repeat(64),
      },
    });

    await expect(service.register({
      actorWalletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      venueId: 'venue-1',
      machineClass: 'GPU',
      cpu: 'CPU',
    })).rejects.toThrow(HttpException);
  });

  it('owner 未設定なら actor を owner に紐付けて作成する', async () => {
    const { service, prismaMock } = buildService({
      ownerUserId: null,
      strict: false,
      onchainResult: null,
    });

    const row = await service.register({
      actorWalletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      venueId: 'venue-1',
      machineClass: 'CPU',
      cpu: 'Ryzen 9 7950X',
      ramGb: 64,
      storageGb: 1000,
      localSerial: 'TEST-SERIAL',
    });

    expect(prismaMock.merchant.update).toHaveBeenCalledWith({
      where: { id: 'merchant-1' },
      data: { ownerUserId: 'actor-user-id' },
    });
    expect(row.status).toBe('REGISTERED');
    expect(row.onchainTokenId).toBeNull();
    expect(row.onchainTxHash).toBeNull();
  });

  it('strict=true でオンチェーン失敗時は 502 を返す', async () => {
    const { service } = buildService({
      ownerUserId: 'actor-user-id',
      strict: true,
      onchainResult: null,
    });

    await expect(service.register({
      actorWalletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      venueId: 'venue-1',
      machineClass: 'GPU',
      gpu: 'RTX 4090',
    })).rejects.toThrow(HttpException);
  });
});
