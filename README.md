# NodeStay

NodeStay は、利用権マーケットとコンピュート市場を組み合わせた Web3 アプリケーションです。
フロントエンドは Next.js、バックエンドは NestJS、チェーンは Polygon Amoy（testnet）を使用しています。

## 現在の実装状況（2026-03）

- 利用権の購入・出品・二次購入・取消の主線が動作
- Web3Auth（ソーシャルログイン）からの AA 購入フローを全購入経路で統一実装
  - `useTxMode` フックが `loginMethod` を見て AA / wagmi を自動選択
  - ZeroDev Kernel Account v0.3.1 + ZeroDev Bundler + Pimlico Paymaster
- ログインフローを有限状態機械（`LoginStep`）で管理し、状態残留バグを解消
- ユーザーストアのウォレットアドレスを3フィールドに分離
  - `connectedWalletAddress`（wagmi 注入）/ `socialWalletAddress`（Web3Auth）/ `walletAddress`（SIWE 認証済み）
- `Idempotency-Key` を使った API 冪等制御を実装
- Vercel（Web）+ Render（API/Worker）前提の構成

## 技術スタック

- **Frontend**: Next.js 14, React 18, TypeScript, wagmi, viem, RainbowKit, Zustand
- **Backend**: NestJS, Prisma, PostgreSQL
- **Contracts**: Solidity, Hardhat, OpenZeppelin
- **AA**: Web3Auth + ZeroDev Kernel Account v0.3.1 + ZeroDev Bundler + Pimlico Paymaster
- **Monorepo**: npm workspaces

## リポジトリ構成

```text
.
├─ apps/
│  ├─ web/     # Next.js
│  └─ api/     # NestJS
├─ packages/
│  ├─ contracts/
│  ├─ api-client/
│  └─ domain/
├─ docs/
├─ scripts/    # デバッグ・検証用スクリプト
└─ render.yaml
```

## 前提環境

- Node.js 20 以上
- npm 10 以上
- PostgreSQL 15 以上

## セットアップ

```bash
git clone <repository-url>
cd Node-Stay
npm install
```

### 1) API 環境変数

`apps/api/.env.example` を元に `apps/api/.env` を作成してください。

最低限必要な項目:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `AMOY_RPC_URL`
- `MACHINE_REGISTRY_ADDRESS`
- `USAGE_RIGHT_ADDRESS`
- `SETTLEMENT_ADDRESS`
- `MARKETPLACE_ADDRESS`
- `COMPUTE_RIGHT_ADDRESS`
- `REVENUE_RIGHT_ADDRESS`
- `JPYC_TOKEN_ADDRESS`
- `OPERATOR_PRIVATE_KEY`（オンチェーン書き込みが必要な場合）

### 2) Web 環境変数

`apps/web/.env.local.example` を元に `apps/web/.env.local` を作成してください。

**基本設定（必須）:**

| 変数名 | 説明 |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | NestJS API の URL |
| `NEXT_PUBLIC_CHAIN_ID` | `80002`（Polygon Amoy）|
| `NEXT_PUBLIC_CHAIN_NAME` | `Polygon Amoy` |
| `NEXT_PUBLIC_RPC_URL` | Amoy RPC URL |
| `NEXT_PUBLIC_CHAIN_EXPLORER_URL` | `https://amoy.polygonscan.com` |
| `NEXT_PUBLIC_JPYC_TOKEN_ADDRESS` | JPYC ERC-20 コントラクト |
| `NEXT_PUBLIC_SETTLEMENT_ADDRESS` | Settlement コントラクト |
| `NEXT_PUBLIC_MARKETPLACE_ADDRESS` | Marketplace コントラクト |
| `NEXT_PUBLIC_USAGE_RIGHT_ADDRESS` | UsageRight NFT コントラクト |

**Web3Auth（必須）:**

| 変数名 | 説明 |
|---|---|
| `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` | Web3Auth ダッシュボードで発行 |
| `NEXT_PUBLIC_WEB3AUTH_NETWORK` | `sapphire_devnet`（本番は `sapphire_mainnet`）|

**AA 購入フロー（必須）:**

AA（Account Abstraction）購入を動作させるには以下が **全て必要** です。
どれか一つでも欠けると「AA approve に失敗しました」エラーになります。

| 変数名 | 説明 |
|---|---|
| `NEXT_PUBLIC_BUNDLER_RPC_URL` | **ZeroDev の Bundler URL**（`https://rpc.zerodev.app/api/v3/<PROJECT_ID>/chain/80002`）|
| `NEXT_PUBLIC_PAYMASTER_RPC_URL` | Pimlico の Paymaster URL（未設定時は Bundler URL を使用）|

> **重要**: Bundler は ZeroDev ダッシュボード（[dashboard.zerodev.app](https://dashboard.zerodev.app)）でプロジェクトを作成して取得してください。
> Pimlico の汎用 URL（`api.pimlico.io`）を Bundler URL に設定しても動作しません（ZeroDev SDK 専用メソッドを使用するため）。

> **Gas Policy**: ZeroDev ダッシュボードの **Gas Policies** で「全トランザクションをスポンサー」するポリシーを設定してください。
> 未設定の場合、UserOperation が `userOp did not match any gas sponsoring policies` で拒否されます。

任意設定:

| 変数名 | 説明 |
|---|---|
| `NEXT_PUBLIC_ENTRYPOINT_ADDRESS` | 未設定時は ERC-4337 v0.7 デフォルト値を使用 |
| `NEXT_PUBLIC_KERNEL_FACTORY_ADDRESS` | 未設定時は ZeroDev SDK デフォルトを使用 |

## 開発コマンド

ルートで実行:

```bash
npm run dev        # API + Web 同時起動
npm run build      # workspaces 全体 build
npm run typecheck  # workspaces 全体 typecheck
npm run test       # workspaces 全体 test
```

個別実行:

```bash
npm run dev -w @nodestay/api
npm run dev -w @nodestay/web
npm run dev:workers -w @nodestay/api
```

DB 補助:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

## デプロイ

### Vercel（Web）

- プロジェクトルート: リポジトリルート
- `NEXT_PUBLIC_*` 環境変数を全て設定
- **`NEXT_PUBLIC_BUNDLER_RPC_URL` の設定を忘れると AA 購入が全滅します**
- 環境変数追加後は必ず **Redeploy** してください

### Render（API / Worker）

- `render.yaml` をベースに構築
- API と Worker で同一のチェーン関連環境変数を設定
- `CORS_ORIGINS` に Vercel の本番 URL を追加

## AA / Paymaster メモ

- ソーシャルログイン時は `useTxMode` フックが自動で AA モードを選択
- ウォレットログイン時は `useTxMode` が wagmi モードを選択
- `loginMethod` の判定は全購入経路で `useTxMode` に集約（ページ側に分岐ロジックなし）
- Paymaster の API キーはフロント公開変数で扱うため、ZeroDev / Pimlico ダッシュボードで Origin 制限と利用上限を必ず設定してください

## 既知課題

- Render API のコールドスタート時、初回 API 同期に遅延が出る場合がある
- このため、購入直後のバックエンド同期は outbox リトライで吸収する設計を採用

## ドキュメント運用方針

- ドキュメント、コードコメント、フロント文言は日本語を原則とする
- 仕様補足は `docs/` 配下に追記する

## 参考ドキュメント

- `docs/ARCHITECTURE.md`
- `docs/DEPLOY_RENDER_VERCEL.md`

## ライセンス

MIT
