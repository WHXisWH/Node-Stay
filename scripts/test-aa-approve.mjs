/**
 * AA approve 診断スクリプト
 * JPYC.approve(settlement, amount) を UserOperation で送信し、
 * 成功／失敗の詳細を出力する。
 *
 * 実行: node scripts/test-aa-approve.mjs
 */

import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, encodeFunctionData } from 'viem';
import { polygonAmoy } from 'viem/chains';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import { createKernelAccount, createKernelAccountClient } from '@zerodev/sdk';
import { entryPoint07Address } from 'viem/account-abstraction';
import { createPimlicoClient } from 'permissionless/clients/pimlico';

// ── 設定 ──────────────────────────────────────────────────────────────
const PK              = 'af4c183bca0be474bf4225da2f27163cba51a258aab65490ab476863bd83eb95';
const BUNDLER_URL     = 'https://api.pimlico.io/v2/80002/rpc?apikey=pim_AsmNYx336jeoA8WkJ1ZU8n';
const RPC_URL         = 'https://rpc-amoy.polygon.technology';
const SETTLEMENT_ADDR = '0x3ab2F7f7Ad6E3654C59175859c2D9e2B122F7dA9';

// ２つの JPYC アドレスを両方試す
const JPYC_ENV        = '0x2fA62C3E53b67A9678F4Aac14E2843c1dF7b8AfD'; // .env の値
const JPYC_USER       = '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29'; // ユーザー指定値
const APPROVE_AMOUNT  = 1n; // 最小値でテスト（1 wei 相当）

const ERC20_APPROVE_ABI = [{
  name: 'approve',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}];

// ── ユーティリティ ────────────────────────────────────────────────────
function encodeApprove(jpycAddress) {
  return encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [SETTLEMENT_ADDR, APPROVE_AMOUNT],
  });
}

async function checkBalance(publicClient, address, label) {
  try {
    const code = await publicClient.getBytecode({ address });
    const isContract = code && code !== '0x';
    console.log(`  ${label} (${address}): ${isContract ? '✅ コントラクト存在' : '❌ コントラクトなし（アドレス不正の可能性）'}`);
    return isContract;
  } catch (e) {
    console.log(`  ${label} チェック失敗: ${e.message}`);
    return false;
  }
}

async function buildKernel(ownerAccount, publicClient) {
  const entryPoint = { address: entryPoint07Address, version: '0.7' };
  const kernelVersion = '0.3.1';

  console.log('\n▶ ECDSA validator 作成中...');
  const ownerSigner = createWalletClient({
    account: ownerAccount,
    chain: polygonAmoy,
    transport: http(RPC_URL),
  });

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: ownerSigner,
    entryPoint,
    kernelVersion,
  });

  console.log('▶ Kernel アカウント作成中...');
  const kernelAccount = await createKernelAccount(publicClient, {
    entryPoint,
    kernelVersion,
    plugins: { sudo: ecdsaValidator },
  });

  console.log(`  スマートアカウントアドレス: ${kernelAccount.address}`);

  const pimlicoClient = createPimlicoClient({
    chain: polygonAmoy,
    transport: http(BUNDLER_URL),
    entryPoint,
  });

  const kernelClient = createKernelAccountClient({
    account: kernelAccount,
    chain: polygonAmoy,
    client: publicClient,
    bundlerTransport: http(BUNDLER_URL),
    paymaster: {
      getPaymasterData: (args) => pimlicoClient.getPaymasterData(args),
      getPaymasterStubData: (args) => pimlicoClient.getPaymasterStubData(args),
    },
  });

  return { kernelClient, smartAccountAddress: kernelAccount.address };
}

async function tryApprove(kernelClient, jpycAddress, label) {
  console.log(`\n▶ approve 送信テスト: ${label} (${jpycAddress})`);
  try {
    const callData = encodeApprove(jpycAddress);
    const hash = await kernelClient.sendUserOperation({
      calls: [{ to: jpycAddress, data: callData, value: 0n }],
    });
    console.log(`  ✅ UserOperation hash: ${hash}`);
    console.log('  レシート待機中...');
    const receipt = await kernelClient.waitForUserOperationReceipt({ hash });
    console.log(`  ✅ tx hash: ${receipt.receipt.transactionHash}`);
    console.log(`  ✅ ステータス: ${receipt.receipt.status}`);
    return true;
  } catch (e) {
    console.error(`  ❌ エラー: ${e.message}`);
    if (e.cause) console.error(`  原因: ${JSON.stringify(e.cause, null, 2)}`);
    if (e.details) console.error(`  詳細: ${e.details}`);
    return false;
  }
}

// ── メイン ────────────────────────────────────────────────────────────
async function main() {
  console.log('=== AA approve 診断スクリプト (Polygon Amoy) ===\n');

  const pk = PK.startsWith('0x') ? PK : `0x${PK}`;
  const ownerAccount = privateKeyToAccount(pk);
  console.log(`EOA アドレス: ${ownerAccount.address}`);

  const publicClient = createPublicClient({
    chain: polygonAmoy,
    transport: http(RPC_URL),
  });

  // コントラクト存在確認
  console.log('\n▶ コントラクト存在確認:');
  await checkBalance(publicClient, JPYC_ENV,        'JPYC (.env)');
  await checkBalance(publicClient, JPYC_USER,       'JPYC (ユーザー指定)');
  await checkBalance(publicClient, SETTLEMENT_ADDR, 'Settlement');

  // Kernel 構築
  let kernelClient;
  try {
    ({ kernelClient } = await buildKernel(ownerAccount, publicClient));
  } catch (e) {
    console.error(`\n❌ Kernel 構築失敗: ${e.message}`);
    if (e.cause) console.error(`原因: ${JSON.stringify(e.cause, null, 2)}`);
    process.exit(1);
  }

  // 両方の JPYC アドレスで approve を試行
  const r1 = await tryApprove(kernelClient, JPYC_ENV,  'JPYC (.env 値)');
  if (!r1) {
    await tryApprove(kernelClient, JPYC_USER, 'JPYC (ユーザー指定値)');
  }

  console.log('\n=== 診断完了 ===');
}

main().catch((e) => {
  console.error('予期しないエラー:', e);
  process.exit(1);
});
