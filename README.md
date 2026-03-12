# NodeStay

NodeStay は、利用権マーケットとコンピュート市場を組み合わせた Web3 アプリケーションです。  
フロントエンドは Next.js、バックエンドは NestJS、チェーンは Polygon Amoy（testnet）を使用しています。

## 現在の実装状況（2026-03）
- 利用権の購入、出品、購入、取消の主線が動作
- Web3Auth（ソーシャルログイン）からの AA 購入フローを実装
- `Idempotency-Key` を使った API 冪等制御を実装
- Vercel（Web）+ Render（API/Worker）前提の構成
- Paymaster はコード統合済み、環境変数と実運用検証を継続中

## 技術スタック
- Frontend: Next.js 14, React 18, TypeScript, wagmi, viem, RainbowKit, Zustand
- Backend: NestJS, Prisma, PostgreSQL
- Contracts: Solidity, Hardhat, OpenZeppelin
- AA: Web3Auth + Kernel Account + Pimlico（Bundler/Paymaster）
- Monorepo: npm workspaces

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
- `JPYC_TOKEN_ADDRESS`（残高照会に使用）
- `OPERATOR_PRIVATE_KEY`（オンチェーン書き込みが必要な場合）

### 2) Web 環境変数
`apps/web/.env.local.example` を元に `apps/web/.env.local` を作成してください。

最低限必要な項目:
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`
- `NEXT_PUBLIC_WEB3AUTH_NETWORK`
- `NEXT_PUBLIC_CHAIN_ID=80002`
- `NEXT_PUBLIC_CHAIN_NAME=Polygon Amoy`
- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_CHAIN_EXPLORER_URL`
- `NEXT_PUBLIC_MACHINE_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_USAGE_RIGHT_ADDRESS`
- `NEXT_PUBLIC_SETTLEMENT_ADDRESS`
- `NEXT_PUBLIC_MARKETPLACE_ADDRESS`
- `NEXT_PUBLIC_COMPUTE_RIGHT_ADDRESS`
- `NEXT_PUBLIC_REVENUE_RIGHT_ADDRESS`
- `NEXT_PUBLIC_JPYC_TOKEN_ADDRESS`
- `NEXT_PUBLIC_JPYC_ADDRESS`（未設定時は `NEXT_PUBLIC_JPYC_TOKEN_ADDRESS` を利用）

AA 購入を使う場合に必要:
- `NEXT_PUBLIC_BUNDLER_RPC_URL`
- `NEXT_PUBLIC_PAYMASTER_RPC_URL`（未設定時は Bundler URL を利用）
- 任意: `NEXT_PUBLIC_ENTRYPOINT_ADDRESS`
- 任意: `NEXT_PUBLIC_KERNEL_FACTORY_ADDRESS`

## 開発コマンド
ルートで実行:
```bash
npm run dev        # API + Web
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
- `NEXT_PUBLIC_*` 環境変数を設定
- AA を有効化する場合は Pimlico の RPC URL を設定

### Render（API / Worker）
- `render.yaml` をベースに構築
- API と Worker で同一のチェーン関連環境変数を設定
- `CORS_ORIGINS` に Vercel の本番 URL を追加

## AA / Paymaster メモ
- 現行実装は Web3Auth 接続時に AA 購入フローへ分岐
- Bundler / Paymaster は Pimlico RPC を想定
- フロント公開変数で key を扱うため、Pimlico 側で Origin 制限と使用制限を必ず設定してください

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
