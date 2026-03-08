# NodeStay アーキテクチャ詳細

> 最終更新：2026-03-08

---

## 目次

1. [技術アーキテクチャ](#1-技術アーキテクチャ)
   - 1-1. システム全体構成
   - 1-2. フロントエンド内部構造
   - 1-3. バックエンド内部構造
   - 1-4. データフロー（読み取り）
   - 1-5. データフロー（書き込み）
   - 1-6. 区块链イベント同期
2. [業務ロジックアーキテクチャ](#2-業務ロジックアーキテクチャ)
   - 2-1. 利用権市場（座席）フロー
   - 2-2. 二次流通市場（マーケットプレイス）フロー
   - 2-3. 算力市場（コンピュート）フロー
   - 2-4. 収益権市場（Revenue Right）フロー
   - 2-5. ステート遷移図（利用権）
   - 2-6. ステート遷移図（セッション）
   - 2-7. ステート遷移図（コンピュートジョブ）

---

## 1. 技術アーキテクチャ

### 1-1. システム全体構成

```mermaid
graph TB
    subgraph Client["クライアント層"]
        Browser["ブラウザ<br/>（MetaMask / RainbowKit）"]
    end

    subgraph Web["apps/web — Next.js 14 (App Router)"]
        Pages["ページ (app/**/page.tsx)<br/>表示のみ・ロジックなし"]
        Hooks["Custom Hooks<br/>use*Page / use*Dashboard"]
        Stores["Zustand ストア<br/>user.store（JWT・wallet・sessionId）"]
        ApiClient["@nodestay/api-client<br/>NodeStayClient"]
        WagmiHooks["wagmi Hooks<br/>useWriteContract / useJPYC"]
    end

    subgraph Api["apps/api — NestJS"]
        Controllers["Controllers (v1/*)"]
        Services["Services<br/>session / usage-right / revenue …"]
        PrismaORM["Prisma ORM"]
        BlockchainSvcs["Blockchain Services<br/>UsageRight / Settlement / RevenueRight …"]
        Listener["BlockchainListenerService<br/>イベント監視 → DB 書き戻し"]
        Workers["独立 Worker プロセス<br/>compute-scheduler<br/>revenue-allocation-scheduler"]
    end

    subgraph DB["永続化層"]
        Postgres[("PostgreSQL<br/>（オフチェーン台帳）")]
    end

    subgraph Chain["Polygon Amoy — オンチェーン"]
        MachineReg["NodeStayMachineRegistry<br/>（ERC-721 機器 NFT）"]
        UsageRight["NodeStayUsageRight<br/>（ERC-721 利用権 NFT）"]
        Settlement["NodeStaySettlement<br/>（JPYC hold/capture/release）"]
        Marketplace["NodeStayMarketplace<br/>（二次流通）"]
        ComputeRight["NodeStayComputeRight<br/>（ERC-1155 算力権）"]
        RevenueRight["NodeStayRevenueRight<br/>（ERC-1155 収益権）"]
        JPYC["JPYC Token<br/>（ERC-20 円建て）"]
    end

    Browser -->|"HTTP / REST"| Pages
    Browser -->|"wagmi / viem"| WagmiHooks
    Pages --> Hooks
    Hooks --> Stores
    Hooks --> ApiClient
    Hooks --> WagmiHooks
    ApiClient -->|"HTTP REST"| Controllers
    Controllers --> Services
    Services --> PrismaORM
    Services --> BlockchainSvcs
    PrismaORM --> Postgres
    BlockchainSvcs -->|"ethers.js"| Chain
    Listener -->|"イベントポーリング"| Chain
    Listener -->|"DB 書き戻し"| Postgres
    Workers --> Services
    WagmiHooks -->|"直接署名 tx"| Chain

    style Chain fill:#7c3aed,color:#fff
    style Web fill:#1e40af,color:#fff
    style Api fill:#065f46,color:#fff
    style DB fill:#92400e,color:#fff
```

---

### 1-2. フロントエンド内部構造

```mermaid
graph TB
    subgraph NextApp["Next.js App Router (src/app/)"]
        Layout["layout.tsx<br/>Header + Footer + Provider"]
        Home["page.tsx<br/>ホーム"]
        Venues["venues/page.tsx<br/>店舗一覧"]
        VenueDetail["venues/[id]/page.tsx<br/>店舗詳細・購入"]
        Passes["passes/page.tsx<br/>マイ利用権"]
        Sessions["sessions/page.tsx<br/>セッション"]
        Marketplace["marketplace/page.tsx<br/>二次市場"]
        Compute["compute/page.tsx<br/>算力"]
        Revenue["revenue/page.tsx<br/>収益権"]
        Merchant["merchant/**<br/>商家管理"]
    end

    subgraph HookLayer["Custom Hooks (src/hooks/)"]
        useVenueDetail["useVenueDetailPage<br/>JPYC approve → purchase"]
        usePasses["usePassesPage"]
        useSession["useSessionPage<br/>activeSessionId → getSession"]
        useMarket["useMarketplacePage<br/>listMarketplaceListings"]
        useMarketWrite["useMarketplaceWrite<br/>approve → createListing / buyListing"]
        useRevenue["useRevenueDashboard<br/>wagmi claim"]
        useMerchant["useMerchant*<br/>listVenues → listMachines"]
    end

    subgraph StateLayer["状態管理 (src/models/stores/)"]
        UserStore["user.store<br/>jwt / walletAddress<br/>activeSessionId（永続化）"]
        ComputeStore["compute.store<br/>ジョブ状態"]
    end

    subgraph ServiceLayer["サービス層 (src/services/)"]
        NodeStayClient["NodeStayClient<br/>createNodeStayClient()"]
        ComputeService["compute.service.ts"]
    end

    subgraph ChainLayer["チェーン操作 (wagmi)"]
        useJPYC["useJPYC<br/>approve + waitForReceipt"]
        useWrite["useWriteContract<br/>Marketplace / RevenueRight"]
        RainbowKit["RainbowKit<br/>ウォレット接続"]
    end

    Layout --> Home & Venues & VenueDetail & Passes & Sessions & Marketplace & Compute & Revenue & Merchant
    VenueDetail --> useVenueDetail
    Passes --> usePasses
    Sessions --> useSession
    Marketplace --> useMarket & useMarketWrite
    Revenue --> useRevenue
    Merchant --> useMerchant

    useVenueDetail & usePasses & useSession & useMarket & useMerchant --> NodeStayClient
    useRevenue --> NodeStayClient
    useVenueDetail --> useJPYC
    useMarketWrite --> useJPYC & useWrite
    useRevenue --> useWrite
    Compute --> ComputeService

    useSession --> UserStore
    useVenueDetail --> UserStore
    Compute --> ComputeStore
    RainbowKit --> UserStore

    style NextApp fill:#1e3a5f,color:#fff
    style HookLayer fill:#14532d,color:#fff
    style StateLayer fill:#4a1d96,color:#fff
    style ServiceLayer fill:#7c2d12,color:#fff
    style ChainLayer fill:#1e1b4b,color:#fff
```

---

### 1-3. バックエンド内部構造

```mermaid
graph TB
    subgraph V1Module["V1Module (src/modules/v1/)"]
        subgraph Controllers["Controllers"]
            VC["venues.controller"]
            UC["usage-right.controller"]
            SC["sessions.controller"]
            MC["machines.controller"]
            MkC["marketplace.controller"]
            CC["compute.controller"]
            RC["revenue.controller"]
            IC["identity.controller"]
        end

        subgraph Services["Services"]
            VS["venue.service"]
            US["usage-right.service"]
            SS["session.service"]
            MS["machine.service"]
            CS["compute.service"]
            RS["revenue.service"]
            RAS["revenue-allocation.service"]
        end

        subgraph Interceptors["Interceptors"]
            II["IdempotencyInterceptor<br/>全 POST/PUT/PATCH に適用"]
        end
    end

    subgraph BlockchainModule["BlockchainModule (src/blockchain/) @Global"]
        BCProvider["BlockchainProvider<br/>ethers.JsonRpcProvider"]
        MachineCS["MachineRegistryContractService"]
        UsageCS["UsageRightContractService"]
        SettleCS["SettlementContractService"]
        MarketCS["MarketplaceContractService"]
        ComputeCS["ComputeRightContractService"]
        RevenueCS["RevenueRightContractService"]
        Listener["BlockchainListenerService<br/>E1〜E5 イベント監視"]
    end

    subgraph PrismaModule["PrismaModule"]
        Prisma["PrismaService<br/>PostgreSQL"]
    end

    subgraph Workers["独立 Worker プロセス"]
        W1["compute-scheduler.ts<br/>毎分: overdue FAILED<br/>毎時: expired EXPIRED"]
        W2["revenue-allocation-scheduler.ts<br/>DAILY/WEEKLY/MONTHLY 配分"]
    end

    Controllers --> Services
    Services --> Prisma
    Services -.->|"fire-and-forget"| UsageCS & SettleCS & RevenueCS & ComputeCS
    Listener -->|"イベント polling"| BCProvider
    Listener -->|"DB 書き戻し"| Prisma
    W1 & W2 --> Services

    style V1Module fill:#065f46,color:#fff
    style BlockchainModule fill:#7c3aed,color:#fff
    style PrismaModule fill:#92400e,color:#fff
    style Workers fill:#1e3a5f,color:#fff
```

---

### 1-4. データフロー（読み取り）

```mermaid
sequenceDiagram
    participant Browser as ブラウザ
    participant Hook as Custom Hook
    participant Client as NodeStayClient
    participant API as NestJS API
    participant DB as PostgreSQL

    Browser->>Hook: ページレンダリング (useEffect)
    Hook->>Client: client.listUsageRights({ ownerUserId })
    Client->>API: GET /v1/usage-rights?ownerUserId=0xABC
    API->>DB: prisma.usageRight.findMany()
    DB-->>API: UsageRight[]
    API-->>Client: JSON レスポンス
    Client-->>Hook: 型付き結果
    Hook-->>Browser: state 更新 → 再レンダリング
```

---

### 1-5. データフロー（書き込み：購入フロー）

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Hook as useVenueDetailPage
    participant JPYC as useJPYC
    participant Wallet as MetaMask
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Chain as Polygon Amoy

    User->>Hook: 「購入」ボタン押下
    Hook->>JPYC: approve(settlementAddress, price)
    JPYC->>Wallet: 署名要求
    Wallet-->>Chain: JPYC.approve tx 送信
    Chain-->>JPYC: 承認完了
    JPYC-->>Hook: approve 成功

    Hook->>API: POST /v1/usage-rights/purchase<br/>{ productId, buyerWallet }
    API->>DB: usageRight.create(status=ACTIVE)
    DB-->>API: UsageRight レコード
    API-->>Hook: { usageRightId }

    Note over API,Chain: Fire-and-forget（非同期）
    API-)Chain: UsageRight.mint(buyerWallet, tokenId, ...)
    Chain-)API: tx hash
    API-)DB: onchainTxHash 更新

    Hook-->>User: 購入完了表示
```

---

### 1-6. ブロックチェーンイベント同期

```mermaid
graph LR
    subgraph Chain["Polygon Amoy"]
        E1["ComputeRightMinted"]
        E2["JobCompleted / JobInterrupted"]
        E3["AllocationRecorded"]
        E4["Claimed"]
        E5["Listed / Purchased / Cancelled"]
    end

    subgraph Listener["BlockchainListenerService"]
        Poll["定期ポーリング<br/>（POLLING_INTERVAL ms）"]
        H1["onComputeRightMinted"]
        H2["onJobCompleted"]
        H3["onAllocationRecorded"]
        H4["onClaimed"]
        H5["onMarketplaceEvent"]
    end

    subgraph DB["PostgreSQL"]
        CR["compute_rights<br/>onchain_token_id 更新"]
        CJ["compute_jobs<br/>status + onchainTxHash 更新"]
        RA["revenue_allocations<br/>allocationTxHash 更新"]
        RC["revenue_claims<br/>claimTxHash 更新"]
        UL["usage_listings<br/>onchainListingId / status 更新"]
    end

    Poll --> E1 & E2 & E3 & E4 & E5
    E1 --> H1 --> CR
    E2 --> H2 --> CJ
    E3 --> H3 --> RA
    E4 --> H4 --> RC
    E5 --> H5 --> UL

    style Chain fill:#7c3aed,color:#fff
    style Listener fill:#065f46,color:#fff
    style DB fill:#92400e,color:#fff
```

---

## 2. 業務ロジックアーキテクチャ

### 2-1. 利用権市場（座席）フロー

```mermaid
flowchart TD
    A([ユーザー]) --> B["/venues で店舗を選ぶ"]
    B --> C["套餐を選択・購入モーダル表示"]
    C --> D{"JPYC 残高\n十分？"}
    D -- いいえ --> E["残高不足エラー"]
    D -- はい --> F["JPYC.approve(Settlement合約)"]
    F --> G["POST /v1/usage-rights/purchase"]
    G --> H[("DB: UsageRight\nstatus=ACTIVE")]
    H --> I["🔗 非同期: UsageRight.mint"]
    I --> J[("onchainTxHash 更新")]

    H --> K["/passes で利用権確認"]
    K --> L["QRコード表示 / チェックイン"]
    L --> M["POST /v1/sessions/checkin"]
    M --> N[("DB: Session\nstatus=ACTIVE")]
    N --> O["user.store.activeSessionId 保存"]
    O --> P["/sessions タイマー表示"]
    P --> Q["チェックアウト"]
    Q --> R["POST /v1/sessions/checkout"]
    R --> S[("DB: Session COMPLETED\nUsageRight CONSUMED")]
    S --> T["🔗 非同期: Settlement.settleUsage"]
    T --> U[("settlementTxHash 更新\nLedgerEntry 作成")]

    style A fill:#1e40af,color:#fff
    style I fill:#7c3aed,color:#fff
    style T fill:#7c3aed,color:#fff
    style H fill:#92400e,color:#fff
    style N fill:#92400e,color:#fff
    style S fill:#92400e,color:#fff
    style U fill:#92400e,color:#fff
```

---

### 2-2. 二次流通市場（マーケットプレイス）フロー

```mermaid
flowchart TD
    subgraph Seller["売手フロー（wagmi 直接署名）"]
        S1([売手]) --> S2["利用権を選択"]
        S2 --> S3["価格入力"]
        S3 --> S4["🔗 UsageRight.approve(Marketplace)"]
        S4 --> S5["🔗 Marketplace.createListing(tokenId, price)"]
        S5 --> S6[("DB: UsageListing\nstatus=LISTED\nonchainListingId 書き込み")]
    end

    subgraph Marketplace["マーケットプレイス表示"]
        M1["/marketplace 一覧表示"]
        M2["GET /v1/marketplace/listings"]
        M1 --> M2
    end

    subgraph Buyer["買手フロー（wagmi 直接署名）"]
        B1([買手]) --> B2["出品一覧から選択"]
        B2 --> B3["🔗 JPYC.approve(Marketplace, price)"]
        B3 --> B4["🔗 Marketplace.buyListing(listingId)"]
        B4 --> B5[("チェーン: NFT 所有権移転\nJPYC 売手へ送金")]
        B5 --> B6["Purchased イベント → Listener"]
        B6 --> B7[("DB: UsageListing\nstatus=SOLD")]
    end

    S6 --> M1
    M2 --> B1

    style Seller fill:#1e3a5f,color:#fff
    style Buyer fill:#14532d,color:#fff
    style Marketplace fill:#4a1d96,color:#fff
    style S4 fill:#7c3aed,color:#fff
    style S5 fill:#7c3aed,color:#fff
    style B3 fill:#7c3aed,color:#fff
    style B4 fill:#7c3aed,color:#fff
    style B5 fill:#7c3aed,color:#fff
```

---

### 2-3. 算力市場（コンピュート）フロー

```mermaid
flowchart TD
    Admin["管理者"] --> R1["POST /v1/machines（機器登録）"]
    R1 --> R2["🔗 MachineRegistry.registerMachine"]
    R2 --> R3[("DB: Machine status=ACTIVE")]

    User([依頼者]) --> C1["/compute/nodes でノード選択"]
    C1 --> C2["ジョブ提出フォーム"]
    C2 --> C3["POST /v1/compute/jobs"]
    C3 --> C4[("DB: ComputeJob\nstatus=PENDING")]
    C4 --> C5["🔗 非同期: ComputeRight.startJob"]

    C5 --> C6{"ジョブ実行"}
    C6 -- 完了 --> C7["🔗 ComputeRight.completeJob"]
    C6 -- 失敗 --> C8["🔗 ComputeRight.failJob"]
    C6 -- キャンセル --> C9["🔗 ComputeRight.interruptJob"]

    C7 --> C10["JobCompleted イベント → Listener"]
    C10 --> C11[("DB: ComputeJob\nstatus=COMPLETED\nonchainTxHash 更新")]

    subgraph Worker["compute-scheduler Worker"]
        W1["毎分: タイムアウトジョブ → FAILED"]
        W2["毎時: 期限切れ ComputeRight → EXPIRED"]
    end

    C4 -.-> Worker
    C11 --> Revenue["店舗への収益 → RevenueRight へ"]

    style Admin fill:#1e3a5f,color:#fff
    style User fill:#1e40af,color:#fff
    style R2 fill:#7c3aed,color:#fff
    style C5 fill:#7c3aed,color:#fff
    style C7 fill:#7c3aed,color:#fff
    style Worker fill:#065f46,color:#fff
```

---

### 2-4. 収益権市場（Revenue Right）フロー

```mermaid
flowchart TD
    subgraph Issue["発行フェーズ（商家 + 管理者）"]
        M([商家]) --> P1["POST /v1/revenue/programs（草稿作成）"]
        P1 --> P2[("DB: RevenueProgram\nstatus=DRAFT")]
        P2 --> P3["POST .../approve（承認）"]
        P3 --> P4[("DB: status=APPROVED")]
        P4 --> P5["POST .../issue（チェーン発行）"]
        P5 --> P6["🔗 RevenueRight.createProgram(machineId, totalSupply, ...)"]
        P6 --> P7[("DB: status=ACTIVE\nonchainTxHash 更新")]
    end

    subgraph Distribute["分配フェーズ（Worker）"]
        W([revenue-allocation Worker]) --> D1["runBatch({ programId })"]
        D1 --> D2{"周期判定\nDAILY/WEEKLY/MONTHLY"}
        D2 --> D3["売上集計（sessions + compute_jobs）"]
        D3 --> D4["按分計算（保有トークン比率）"]
        D4 --> D5["🔗 RevenueRight.recordAllocation"]
        D5 --> D6[("DB: RevenueAllocation\nallocationTxHash 更新")]
    end

    subgraph Claim["受取フェーズ（投資家 / wagmi 直接署名）"]
        I([投資家]) --> C1["/revenue ダッシュボード"]
        C1 --> C2["配当一覧・未受取表示"]
        C2 --> C3["「受け取る」ボタン押下"]
        C3 --> C4["🔗 RevenueRight.claim(programId, allocationId)"]
        C4 --> C5["Claimed イベント → Listener"]
        C5 --> C6[("DB: RevenueClaim\nclaimTxHash 更新")]
        C6 --> C7["UI 再同期 (loadDashboard)"]
    end

    P7 --> W
    D6 --> I

    style Issue fill:#1e3a5f,color:#fff
    style Distribute fill:#065f46,color:#fff
    style Claim fill:#14532d,color:#fff
    style P6 fill:#7c3aed,color:#fff
    style D5 fill:#7c3aed,color:#fff
    style C4 fill:#7c3aed,color:#fff
```

---

### 2-5. ステート遷移図（利用権）

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : purchase（JPYC 決済成功）
    ACTIVE --> CONSUMED : checkout（使用完了）
    ACTIVE --> LISTED : 二次市場出品
    ACTIVE --> CANCELLED : キャンセル申請
    LISTED --> ACTIVE : 出品取消
    LISTED --> TRANSFERRED : 購入者へ NFT 移転
    TRANSFERRED --> ACTIVE : 新オーナーの ACTIVE
    CONSUMED --> [*]
    CANCELLED --> [*]

    note right of ACTIVE
        オンチェーン: ERC-721 NFT 保有
        DB: onchainTxHash 記録
    end note
    note right of LISTED
        オンチェーン: Marketplace escrow
        DB: onchainListingId 記録
    end note
```

---

### 2-6. ステート遷移図（セッション）

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : checkin（利用権消費）
    ACTIVE --> COMPLETED : checkout（精算完了）
    ACTIVE --> ABANDONED : タイムアウト（Worker）
    COMPLETED --> [*] : settlementTxHash 記録
    ABANDONED --> [*]

    note right of COMPLETED
        オンチェーン: Settlement.settleUsage
        DB: settlementTxHash 記録
        DB: LedgerEntry 作成
    end note
```

---

### 2-7. ステート遷移図（コンピュートジョブ）

```mermaid
stateDiagram-v2
    [*] --> PENDING : submitJob（JPYC エスクロー）
    PENDING --> ASSIGNED : assignJob
    PENDING --> CANCELLED : cancelJob（依頼者 / Operator）
    ASSIGNED --> RUNNING : startJob
    ASSIGNED --> CANCELLED : cancelJob
    ASSIGNED --> FAILED : failJob（ノード障害）
    RUNNING --> COMPLETED : completeJob
    RUNNING --> INTERRUPTED : interruptJob
    RUNNING --> FAILED : failJob

    COMPLETED --> [*] : 店舗 75% / PF 25% 自動送金
    CANCELLED --> [*] : 全額返金
    FAILED --> [*] : 全額返金
    INTERRUPTED --> [*] : 比例返金

    note right of COMPLETED
        オンチェーン: onchainTxHash 記録
        DB: status + onchainTxHash 更新
    end note
```

---

## 補足：データベース主要テーブル関連

```mermaid
erDiagram
    Venue ||--o{ Machine : "保有"
    Venue ||--o{ UsageProduct : "提供"
    Machine ||--o{ MachineSlot : "スロット"
    Machine ||--o{ RevenueProgram : "収益権"

    UsageProduct ||--o{ UsageRight : "購入"
    UsageRight ||--o| Session : "消費"
    UsageRight ||--o| UsageListing : "出品"

    RevenueProgram ||--o{ RevenueRight : "保有"
    RevenueProgram ||--o{ RevenueAllocation : "配当"
    RevenueAllocation ||--o{ RevenueClaim : "受取"

    Machine ||--o{ ComputeProduct : "算力商品"
    ComputeProduct ||--o{ ComputeRight : "権利"
    ComputeRight ||--o{ ComputeJob : "ジョブ"

    User ||--o{ UsageRight : "所有"
    User ||--o{ RevenueRight : "保有"
    User ||--o{ ComputeJob : "依頼"
```
