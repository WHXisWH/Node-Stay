# NodeStay

ネットカフェ向け **利用権トークン化・遊休算力レンタル・収益権分配** を統合した三面マーケットプレイスです。
JPYC（円建てステーブルコイン）決済・Polygon Amoy (testnet) で動作します。

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [技術アーキテクチャ（概要）](#2-技術アーキテクチャ概要)
3. [業務ロジックアーキテクチャ（概要）](#3-業務ロジックアーキテクチャ概要)
4. [技術スタック](#4-技術スタック)
5. [ディレクトリ構成](#5-ディレクトリ構成)
6. [セットアップ](#6-セットアップ)
7. [開発サーバー起動](#7-開発サーバー起動)
8. [テスト](#8-テスト)
9. [デプロイ済みコントラクト](#9-デプロイ済みコントラクト)
10. [フロントエンド画面一覧](#10-フロントエンド画面一覧)

> 詳細アーキテクチャ（Mermaid 図全集）→ **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**
> 開発・テストガイド → **[docs/DEV_GUIDE.md](docs/DEV_GUIDE.md)**

---

## 1. プロジェクト概要

| マーケット | 概要 | 決済 |
|---|---|---|
| **座席利用権市場** | ERC-721 NFT として利用権を発行・購入→入店→精算 | JPYC → Settlement コントラクト |
| **二次流通市場** | 利用権の P2P 取引（出品・購入・キャンセル） | JPYC → Marketplace コントラクト |
| **算力市場** | ネットカフェ PC/GPU を時間貸し（ERC-1155 算力権） | JPYC エスクロー → 完了時 75/25 自動分配 |
| **収益権市場** | 機器収益を ERC-1155 トークンで分散投資・配当受取 | JPYC → RevenueRight コントラクト |

---

## 2. 技術アーキテクチャ（概要）

```mermaid
graph TB
    subgraph FE["apps/web — Next.js 14"]
        Pages["Pages (App Router)"]
        Hooks["Custom Hooks<br/>use*Page / use*Dashboard"]
        Wagmi["wagmi / RainbowKit<br/>ウォレット・直接署名"]
    end

    subgraph BE["apps/api — NestJS"]
        API["REST API (v1/*)"]
        BCSvcs["Blockchain Services<br/>fire-and-forget"]
        Listener["BlockchainListenerService<br/>イベント → DB 書き戻し"]
        Workers["Worker プロセス<br/>compute / revenue"]
    end

    subgraph Chain["Polygon Amoy"]
        Contracts["6 コントラクト<br/>MachineRegistry / UsageRight<br/>Settlement / Marketplace<br/>ComputeRight / RevenueRight"]
    end

    DB[("PostgreSQL<br/>オフチェーン台帳")]

    FE -->|"HTTP REST"| API
    FE -->|"wagmi 直接署名"| Chain
    API --> DB
    BCSvcs -->|"ethers.js"| Chain
    Listener -->|"イベント監視"| Chain
    Listener -->|"書き戻し"| DB
    Workers --> API

    style FE fill:#1e40af,color:#fff
    style BE fill:#065f46,color:#fff
    style Chain fill:#7c3aed,color:#fff
    style DB fill:#92400e,color:#fff
```

> 詳細図（フロントエンド内部・バックエンド内部・データフロー・イベント同期）→ **[docs/ARCHITECTURE.md#1-技術アーキテクチャ](docs/ARCHITECTURE.md#1-技術アーキテクチャ)**

---

## 3. 業務ロジックアーキテクチャ（概要）

```mermaid
flowchart LR
    subgraph Seat["座席利用権"]
        SA["購入\n(JPYC approve → purchase)"]
        SB["入住チェックイン"]
        SC["退房→Settlement精算"]
        SA --> SB --> SC
    end

    subgraph Market["二次流通"]
        MA["出品\n(NFT approve → createListing)"]
        MB["購入\n(JPYC approve → buyListing)"]
        MA --> MB
    end

    subgraph Compute["算力市場"]
        CA["ジョブ提出\n(エスクロー)"]
        CB["実行中"]
        CC["完了→75/25自動分配"]
        CA --> CB --> CC
    end

    subgraph Revenue["収益権"]
        RA["プログラム発行\n(RevenueRight.createProgram)"]
        RB["分配バッチ\n(recordAllocation)"]
        RC["投資家が領取\n(wagmi claim)"]
        RA --> RB --> RC
    end

    ChainEnd["🔗 Polygon Amoy\n（全終局オンチェーン）"]
    SC & MB & CC & RC --> ChainEnd

    style Seat fill:#1e3a5f,color:#fff
    style Market fill:#14532d,color:#fff
    style Compute fill:#4a1d96,color:#fff
    style Revenue fill:#7c2d12,color:#fff
    style ChainEnd fill:#7c3aed,color:#fff
```

> 詳細フロー（各市場のステップ別図・ステート遷移図・ER 図）→ **[docs/ARCHITECTURE.md#2-業務ロジックアーキテクチャ](docs/ARCHITECTURE.md#2-業務ロジックアーキテクチャ)**

---

## 4. 技術スタック

| レイヤー | 技術 | 備考 |
|---|---|---|
| フロントエンド | Next.js 14 (App Router) | TypeScript |
| スタイリング | Tailwind CSS v4 + `@tailwindcss/postcss` | インディゴ × ゴールド |
| ウォレット | RainbowKit + wagmi + viem | MetaMask 等対応 |
| バックエンド | NestJS | Prisma ORM + PostgreSQL |
| コントラクト | Solidity ^0.8.26 + OpenZeppelin v5 | Hardhat 開発環境 |
| ブロックチェーン | Polygon Amoy (chainId: 80002) | testnet |
| 決済トークン | JPYC（ERC-20 円建てステーブルコイン） | |
| 型生成 | TypeChain (ethers-v6) | |
| フロントテスト | Vitest + @testing-library/react | カバレッジ閾値 80% |
| バックエンドテスト | Jest + Supertest | 30/30 pass |
| コントラクトテスト | Mocha + Chai（Hardhat 組み込み） | 61/61 pass |
| モノレポ管理 | npm workspaces | Node.js 20+ |

---

## 5. ディレクトリ構成

```
JPYC_PJ/
├── apps/
│   ├── web/                         # Next.js 14 フロントエンド
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx       # ルートレイアウト（Header / Footer）
│   │       │   ├── globals.css      # Tailwind v4 テーマ定義
│   │       │   ├── page.tsx         # ホームページ
│   │       │   ├── venues/          # 店舗一覧・詳細・購入
│   │       │   ├── passes/          # マイ利用権・詳細・QR
│   │       │   ├── sessions/        # セッション（タイマー・精算）
│   │       │   ├── marketplace/     # 二次流通市場
│   │       │   ├── compute/         # 算力市場（nodes / jobs）
│   │       │   ├── revenue/         # 収益権ダッシュボード
│   │       │   ├── explore/         # 地図探索
│   │       │   └── merchant/        # 商家管理（dashboard / machines / products / compute / revenue-programs）
│   │       ├── hooks/               # Custom Hooks（ビジネスロジック）
│   │       ├── models/stores/       # Zustand ストア（user / compute）
│   │       ├── components/          # UI コンポーネント
│   │       └── services/            # API クライアントファクトリ
│   └── api/                         # NestJS バックエンド
│       └── src/
│           ├── modules/v1/          # REST コントローラー・サービス群
│           ├── blockchain/          # コントラクトサービス・イベントリスナー
│           ├── prisma/              # PrismaService
│           └── workers/             # 独立 Worker プロセス
├── packages/
│   ├── contracts/                   # Hardhat + Solidity
│   │   ├── contracts/               # 6 コントラクト
│   │   ├── scripts/deploy.ts        # Amoy デプロイスクリプト
│   │   ├── scripts/e2e-smoke.ts     # E2E smoke テスト
│   │   ├── test/                    # Mocha テスト（61件）
│   │   └── deployments/             # デプロイ済みアドレス JSON
│   ├── domain/                      # 共有ドメインモデル（TypeScript）
│   └── api-client/                  # NodeStayClient（型安全 HTTP クライアント）
└── docs/
    ├── ARCHITECTURE.md              # アーキテクチャ詳細（Mermaid 図）
    ├── DEV_GUIDE.md                 # 開発・テスト・手動テストガイド
    └── WORKLOG.md                   # セッション別作業ログ
```

---

## 6. セットアップ

### 必要環境

- Node.js 20+
- npm 10+
- PostgreSQL 15+（バックエンド用）

### インストール

```bash
git clone <repository-url>
cd JPYC_PJ
npm install
```

### 環境変数設定

**バックエンド (`apps/api/.env`)**

```env
DATABASE_URL=postgresql://nodestay:nodestay@localhost:5432/nodestay
RPC_URL=https://rpc-amoy.polygon.technology
OPERATOR_PRIVATE_KEY=<デプロイヤー秘密鍵>
MACHINE_REGISTRY_ADDRESS=0x224C501d39E70673eC438625bF2728e08e7711A8
USAGE_RIGHT_ADDRESS=0xdEafE1e975086a2cEd95299B832EaF86b5196cF9
SETTLEMENT_ADDRESS=0x3ab2F7f7Ad6E3654C59175859c2D9e2B122F7dA9
MARKETPLACE_ADDRESS=0x4f8cf6f0FD4Bb27Ab02453012dF14Efd0E3340e6
COMPUTE_RIGHT_ADDRESS=0xb14c3d3A6Ca41Fa6f41ceD756213AA7135c7621d
REVENUE_RIGHT_ADDRESS=0xAa355b440C6850f2551F40e0064e2FB16362e11E
```

**フロントエンド (`apps/web/.env.local`)**

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_MARKETPLACE_ADDRESS=0x4f8cf6f0FD4Bb27Ab02453012dF14Efd0E3340e6
NEXT_PUBLIC_USAGE_RIGHT_ADDRESS=0xdEafE1e975086a2cEd95299B832EaF86b5196cF9
NEXT_PUBLIC_REVENUE_RIGHT_ADDRESS=0xAa355b440C6850f2551F40e0064e2FB16362e11E
NEXT_PUBLIC_JPYC_ADDRESS=0x807Cdfe8893E0bC125DBcA013147068C021ef759
```

### データベースセットアップ

```bash
# PostgreSQL 起動
brew services start postgresql@15

# DB・ユーザー作成
psql postgres -c "CREATE USER nodestay WITH PASSWORD 'nodestay' CREATEDB;"
psql postgres -c "CREATE DATABASE nodestay OWNER nodestay;"

# マイグレーション
npm run -w apps/api prisma migrate deploy

# 初期データ投入（demo venue / machine）
npm run -w apps/api prisma db seed
```

---

## 7. 開発サーバー起動

```bash
# API (NestJS) + Web (Next.js) 同時起動
npm run dev

# 個別起動
npm run dev -w @nodestay/api    # http://localhost:3001
npm run dev -w @nodestay/web    # http://localhost:3000

# Worker プロセス（任意）
npm run -w apps/api dev:workers
```

---

## 8. テスト

### バックエンド（Jest + Supertest）

```bash
# 全テスト（串行実行・30件）
npm run -w apps/api test -- --runInBand

# カバレッジ付き
npm run -w apps/api test:coverage -- --runInBand

# 型チェック
npm run -w apps/api typecheck
```

### フロントエンド（Vitest）

```bash
# 全テスト（10件 pass / 5件 skip）
npm run -w apps/web test

# カバレッジ付き（閾値 80%）
npm run -w apps/web test:coverage

# 型チェック
npm run -w apps/web typecheck
```

### スマートコントラクト（Hardhat / Mocha）

```bash
cd packages/contracts

# コンパイル
npx hardhat compile

# テスト（61件）
npx hardhat test

# カバレッジ
npx hardhat coverage
```

### 全量一括検証

```bash
npm run -w apps/api typecheck && \
npm run -w apps/api test -- --runInBand && \
npm run -w apps/web typecheck && \
npm run -w apps/web test && \
npm run -w packages/api-client typecheck
```

---

## 9. デプロイ済みコントラクト

**ネットワーク：Polygon Amoy (chainId: 80002)**
**Polygonscan で検証済み ✅**

| コントラクト | 役割 | アドレス |
|---|---|---|
| MockERC20 (JPYC テスト用) | ERC-20 テストトークン | `0x807Cdfe8893E0bC125DBcA013147068C021ef759` |
| NodeStayMachineRegistry | ERC-721 機器 NFT 登録 | `0x224C501d39E70673eC438625bF2728e08e7711A8` |
| NodeStayUsageRight | ERC-721 利用権 NFT | `0xdEafE1e975086a2cEd95299B832EaF86b5196cF9` |
| NodeStaySettlement | JPYC hold / capture / release | `0x3ab2F7f7Ad6E3654C59175859c2D9e2B122F7dA9` |
| NodeStayMarketplace | 二次流通（出品・購入） | `0x4f8cf6f0FD4Bb27Ab02453012dF14Efd0E3340e6` |
| NodeStayComputeRight | ERC-1155 算力権 + ジョブ管理 | `0xb14c3d3A6Ca41Fa6f41ceD756213AA7135c7621d` |
| NodeStayRevenueRight | ERC-1155 収益権 + 配当 | `0xAa355b440C6850f2551F40e0064e2FB16362e11E` |

Polygonscan で確認：`https://amoy.polygonscan.com/address/<アドレス>#code`

### 新規デプロイ

```bash
cd packages/contracts
cp .env.example .env   # DEPLOYER_PRIVATE_KEY 等を設定

# Amoy テストネット
npx hardhat run scripts/deploy.ts --network amoy

# E2E smoke テスト（三市場の end-to-end 検証）
npm run smoke:e2e
```

---

## 10. フロントエンド画面一覧

| パス | 画面 | データ |
|---|---|---|
| `/` | ホーム（Hero・機能紹介・HowItWorks） | 静的 |
| `/explore` | 地図探索（MapLibre GL） | 実 API |
| `/venues` | 店舗一覧（検索・フィルタ） | 実 API |
| `/venues/[venueId]` | 店舗詳細・JPYC 購入フロー | 実 API + チェーン |
| `/passes` | マイ利用権（QR・フィルタ） | 実 API |
| `/passes/[id]` | 利用権詳細（転让・キャンセル） | 実 API + チェーン |
| `/sessions` | セッション（リアルタイムタイマー・精算） | 実 API |
| `/marketplace` | 二次流通市場 | 実 API + チェーン |
| `/compute` | 算力マーケット | 実 API |
| `/compute/nodes` | ノード一覧 | 実 API |
| `/compute/jobs` | マイジョブ | 実 API |
| `/revenue` | 収益権ダッシュボード（配当受取） | 実 API + チェーン |
| `/merchant/dashboard` | 商家主控台 | 実 API |
| `/merchant/machines` | 機器管理 | 実 API |
| `/merchant/usage-products` | 利用権套餐管理 | 実 API |
| `/merchant/compute` | 算力ノード管理 | 実 API |
| `/merchant/revenue-programs` | 収益権プログラム管理 | 実 API + チェーン |

**カラーパレット**

| 用途 | カラー |
|---|---|
| ブランド（インディゴ） | `#6366F1`（`--color-brand-500`） |
| JPYC（ゴールド） | `#F59E0B`（`--color-jpyc-500`） |
| ダーク背景 | `#0F172A`（`--color-surface-900`） |

---

## ライセンス

MIT
