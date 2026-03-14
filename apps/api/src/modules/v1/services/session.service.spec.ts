import { HttpStatus } from '@nestjs/common';
import { SessionService } from './session.service';

const VALID_PAYER = '0x9624533Da1F8c28761509585d1fa407a45Cd6BA4';
const VALID_TREASURY = '0x71bb0f1eba26c41ef6703ec30a249bb0f293d6c8';

describe('SessionService treasury wallet handling', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
    jest.restoreAllMocks();
  });

  function buildService(options?: {
    treasuryWallet?: string | null;
    payerWallet?: string | null;
    txHash?: string | null;
    blockchainEnabled?: boolean;
  }) {
    const txHash = options?.txHash ?? '0xtesthash';

    const txMock = {
      session: {
        update: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'COMPLETED',
        }),
      },
      usageRight: {
        update: jest.fn().mockResolvedValue({ id: 'usage-right-1' }),
      },
      ledgerEntry: {
        create: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
      },
    };

    const prisma = {
      session: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          usageRightId: 'usage-right-1',
          machineId: null,
          venueId: 'venue-1',
          checkedInAt: new Date(Date.now() - 10 * 60 * 1000),
          user: { walletAddress: options?.payerWallet ?? VALID_PAYER },
          usageRight: {
            usageProduct: {
              priceJpyc: '12',
            },
          },
          venue: {
            merchantId: 'merchant-1',
            merchant: {
              treasuryWallet: options?.treasuryWallet ?? null,
            },
          },
        }),
      },
      merchant: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(txMock)),
    };

    const settlement = {
      settleUsage: jest.fn().mockResolvedValue(txHash),
    };

    const blockchain = {
      isEnabled: options?.blockchainEnabled ?? false,
      provider: {},
    };

    return {
      service: new SessionService(prisma as any, settlement as any, blockchain as any),
      prisma,
      settlement,
      blockchain,
    };
  }

  it('店舗ウォレット未設定時に PLATFORM_TREASURY へフォールバックして checkout を完了する', async () => {
    process.env.PLATFORM_TREASURY = VALID_TREASURY;
    delete process.env.PLATFORM_FEE_RECIPIENT;

    const { service, settlement, prisma } = buildService({ treasuryWallet: null });
    const result = await service.endSession('session-1');

    expect(settlement.settleUsage).toHaveBeenCalledTimes(1);
    expect(settlement.settleUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        payer: VALID_PAYER,
        venueTreasury: '0x71BB0f1EBa26c41Ef6703ec30A249Bb0F293d6c8',
      }),
    );
    expect(prisma.merchant.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'merchant-1',
        OR: [{ treasuryWallet: null }, { treasuryWallet: '' }],
      },
      data: { treasuryWallet: '0x71BB0f1EBa26c41Ef6703ec30A249Bb0F293d6c8' },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'session-1',
        status: 'COMPLETED',
        basePriceMinor: 1200,
      }),
    );
  });

  it('店舗ウォレットも環境変数も無い場合でも既定ウォレットへフォールバックして checkout を完了する', async () => {
    delete process.env.PLATFORM_TREASURY;
    delete process.env.PLATFORM_FEE_RECIPIENT;

    const { service, settlement } = buildService({ treasuryWallet: null });
    await expect(service.endSession('session-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'session-1',
        status: 'COMPLETED',
      }),
    );
    expect(settlement.settleUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        venueTreasury: '0x71BB0f1EBa26c41Ef6703ec30A249Bb0F293d6c8',
      }),
    );
  });

  it('無効な payer ウォレットは 422 で弾く', async () => {
    process.env.PLATFORM_TREASURY = VALID_TREASURY;
    const { service, settlement } = buildService({
      treasuryWallet: VALID_TREASURY,
      payerWallet: 'not-an-address',
    });

    await expect(service.endSession('session-1')).rejects.toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      response: { message: '実行者ウォレットが未設定または不正です' },
    });
    expect(settlement.settleUsage).not.toHaveBeenCalled();
  });

  it('allowance 不足時は 422(INSUFFICIENT_ALLOWANCE) で弾く', async () => {
    process.env.JPYC_TOKEN_ADDRESS = '0x71bb0f1eba26c41ef6703ec30a249bb0f293d6c8';
    process.env.SETTLEMENT_ADDRESS = '0x3ab2f7f7ad6e3654c59175859c2d9e2b122f7da9';
    const { service, settlement } = buildService({
      treasuryWallet: VALID_TREASURY,
      blockchainEnabled: true,
    });

    jest.spyOn(service as any, 'readPayerTokenState').mockResolvedValue({
      balanceWei: 999999999999999999999n,
      allowanceWei: 0n,
      settlementAddress: '0x3ab2F7f7Ad6E3654C59175859c2D9e2B122F7dA9',
    });

    await expect(service.endSession('session-1')).rejects.toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      response: expect.objectContaining({
        errorCode: 'INSUFFICIENT_ALLOWANCE',
      }),
    });
    expect(settlement.settleUsage).not.toHaveBeenCalled();
  });

  it('残高不足時は 422(INSUFFICIENT_BALANCE) で弾く', async () => {
    process.env.JPYC_TOKEN_ADDRESS = '0x71bb0f1eba26c41ef6703ec30a249bb0f293d6c8';
    process.env.SETTLEMENT_ADDRESS = '0x3ab2f7f7ad6e3654c59175859c2d9e2b122f7da9';
    const { service, settlement } = buildService({
      treasuryWallet: VALID_TREASURY,
      blockchainEnabled: true,
    });

    jest.spyOn(service as any, 'readPayerTokenState').mockResolvedValue({
      balanceWei: 0n,
      allowanceWei: 999999999999999999999n,
      settlementAddress: '0x3ab2F7f7Ad6E3654C59175859c2D9e2B122F7dA9',
    });

    await expect(service.endSession('session-1')).rejects.toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      response: expect.objectContaining({
        errorCode: 'INSUFFICIENT_BALANCE',
      }),
    });
    expect(settlement.settleUsage).not.toHaveBeenCalled();
  });
});
