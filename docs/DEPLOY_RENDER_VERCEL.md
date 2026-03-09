# NodeStay デプロイ手順（Render + Vercel）

このプロジェクトは以下の分離構成を推奨します。

- `apps/web`（Next.js）: Vercel
- `apps/api`（NestJS）: Render Web Service
- Worker 2本（compute / revenue）: Render Background Worker
- DB: Render PostgreSQL

## 1. Render（API + Worker + DB）

### 1.1 Blueprint から作成

1. Render Dashboard で `Blueprint` を選択
2. リポジトリを接続
3. ルートの `render.yaml` を検出させて作成

`render.yaml` には以下が定義済みです。

- PostgreSQL: `nodestay-postgres`
- Web Service: `nodestay-api`
- Worker: `nodestay-compute-scheduler`
- Worker: `nodestay-revenue-allocation`

### 1.2 Render 側で手動設定する env

`sync: false` の項目は Render ダッシュボードで手動入力します。

- `CORS_ORIGINS`
- `OPERATOR_PRIVATE_KEY`
- `MACHINE_REGISTRY_ADDRESS`
- `USAGE_RIGHT_ADDRESS`
- `SETTLEMENT_ADDRESS`
- `MARKETPLACE_ADDRESS`
- `COMPUTE_RIGHT_ADDRESS`
- `REVENUE_RIGHT_ADDRESS`

`CORS_ORIGINS` はカンマ区切りです（例）。

```env
CORS_ORIGINS=https://<your-web>.vercel.app,http://localhost:3000
```

## 2. Vercel（Web）

### 2.1 Project 設定

1. Vercel で New Project
2. リポジトリを選択
3. `Root Directory` を `apps/web` に設定
4. Framework は Next.js を選択

### 2.2 Vercel env 設定（最低限）

```env
NEXT_PUBLIC_API_BASE_URL=https://<your-api>.onrender.com
NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=<your_web3auth_client_id>
NEXT_PUBLIC_WEB3AUTH_NETWORK=sapphire_devnet

NEXT_PUBLIC_MACHINE_REGISTRY_ADDRESS=<amoy_address>
NEXT_PUBLIC_USAGE_RIGHT_ADDRESS=<amoy_address>
NEXT_PUBLIC_SETTLEMENT_ADDRESS=<amoy_address>
NEXT_PUBLIC_MARKETPLACE_ADDRESS=<amoy_address>
NEXT_PUBLIC_COMPUTE_RIGHT_ADDRESS=<amoy_address>
NEXT_PUBLIC_REVENUE_RIGHT_ADDRESS=<amoy_address>
NEXT_PUBLIC_JPYC_TOKEN_ADDRESS=<amoy_jpyc_address>
NEXT_PUBLIC_JPYC_ADDRESS=<amoy_jpyc_address>

NEXT_PUBLIC_CHAIN_ID=80002
NEXT_PUBLIC_CHAIN_NAME=Polygon Amoy
NEXT_PUBLIC_RPC_URL=https://rpc-amoy.polygon.technology
NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon-rpc.com
NEXT_PUBLIC_CHAIN_EXPLORER_URL=https://amoy.polygonscan.com
```

## 3. CORS 設定について

API は `CORS_ORIGINS` を参照して許可オリジンを決定します。

- 未設定時: `http://localhost:3000,http://127.0.0.1:3000`
- 設定時: 指定したオリジンのみに制限
- `credentials: true` のため `*` は使用不可

## 4. デプロイ前ローカル確認コマンド

```bash
npm run build -w @nodestay/api
npm run build -w @nodestay/web
```
