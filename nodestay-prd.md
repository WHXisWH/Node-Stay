# Node Stay PRD

**プロダクトポジション：** 日本のネットカフェ向け「利用権トークン化 + 遊休算力レンタル」両面マーケットプラットフォーム

> **一言で：** ネットカフェの座席を「プログラム可能な資産」（時間パック/延長/譲渡）に変え、遊休PCを算力供給ノードとして活用し、すべてをJPYCで決済する。

---

## 🚨 開発者向け重要事項

### 言語・ローカライゼーション要件

| 項目 | 要件 |
|------|------|
| **フロントエンドUI文言** | すべて日本語で実装すること |
| **コード内コメント** | すべて日本語で記述すること |
| **エラーメッセージ** | ユーザー向けは日本語、ログは英語可 |
| **APIレスポンス** | `message`フィールドは日本語 |
| **ドキュメント** | 技術ドキュメントは日英併記推奨 |

### MVP技術スタック（推奨構成）

| レイヤー | 技術 | 選定理由 |
|----------|------|----------|
| **ブロックチェーン** | Polygon PoS | 低Gas代、高速ファイナリティ、JPYC対応済み |
| **スマートコントラクト** | Solidity + Hardhat | 業界標準、豊富なツール群 |
| **バックエンド** | Node.js (NestJS) または Go (Gin) | 型安全性、スケーラビリティ |
| **フロントエンド** | Next.js 14 + TypeScript | SSR/SSG対応、React Server Components |
| **UIライブラリ** | shadcn/ui + Tailwind CSS | カスタマイズ性、軽量 |
| **ウォレット連携** | wagmi + viem + RainbowKit | モダンなWeb3スタック |
| **データベース** | PostgreSQL + Prisma | リレーショナル、型安全ORM |
| **キャッシュ** | Redis | セッション、リアルタイム在庫 |
| **認証** | NextAuth.js + SIWE | Web2/Web3ハイブリッド認証 |
| **決済** | JPYC SDK + ethers.js | ステーブルコイン決済 |
| **インフラ** | Vercel + Railway または AWS | 日本リージョン対応 |
| **監視** | Sentry + Datadog | エラー追跡、パフォーマンス |

### コンプライアンス前提（要法務相談）

- 本PRDは法的助言ではない。資金移動・電子決済手段・本人確認/記録保存・未成年/深夜規制などは、地域（都道府県/市区町村）と運用形態で要件が変わるため、必ず法務レビューを前提にする
- 「デポジット凍結/解除」「複数店舗共通残高」「P2P譲渡」「出金」「越境の算力需要者」などは規制境界に触れやすい。実装前に“できる/できない”を決め打ちせず、要件を段階的にロールアウトする
- ウォレット方式を明確化する（どちらも成立しうるが要件が大きく異なる）
  - **ノンカストディ**：ユーザーが自分のウォレットで署名/保有（SIWE等）。UXは難しいが「預かり」リスクは下げやすい
  - **カストディ**：プラットフォームが鍵/残高を管理。UXは良いが規制/監査/資産分別/不正対策の要求が重くなる

---

## 第1部：なぜネットカフェなのか？

### 1.1 日本のネットカフェ市場特性

| 特性 | 現状 | 課題 | 機会 |
|------|------|------|------|
| 市場規模 | （参考）2008年は3,000店超・約2,450億円規模 → 近年は縮小傾向（コロナ前で1,500億円未満という推計も） | 過去ピーク前提の事業計画だと過度に楽観的になりやすい | 保守的KPIでの冷スタ設計、遊休リソースの収益化 |
| 料金体系 | パック料金（3h/6h/ナイト）+ 延長 + 追加サービス | 紙の会員証、手動計時、超過トラブル | 自動課金 + 透明なルール |
| 顧客層 | 軽宿泊、リモートワーク、ゲーマー、漫画読者 | 会員システムが店舗ごとに分断 | 統一利用権アセット、譲渡可能 |
| 設備構成 | ハイスペックPC（ゲーム用途）、GPU搭載多数 | 平日・日中は大量に遊休 | 算力レンタル市場 |
| 規制要件 | 本人確認・端末利用記録・深夜/未成年制限（自治体差あり）、保存期間（例：3年）や記録禁止項目の考慮が必要 | KYC/記録保存/権限設計が曖昧だと後から作り直しになる | ルールをパラメータ化し、監査可能なログと最小限の個人情報で運用 |

### 1.2 ターゲットユーザー

#### C向けユーザー

- **ノマドワーカー**：柔軟な時間帯、複数店舗利用、静かな環境を求める
- **ゲーマー**：マシンスペック重視、深夜利用、長時間パック
- **終電難民/軽宿泊**：ナイトパック、シャワー需要
- **漫画愛好家**：時間の柔軟性、価格敏感

#### B向け事業者

- **チェーン店**：快活CLUB、自遊空間、アプレシオ等
- **独立店舗**：地方都市の個人経営ネットカフェ
- **新業態**：コワーキング+ネットカフェ複合型

#### 算力需要者（新規）

- **AI/ML開発者**：モデル学習、推論タスク
- **3DCG/アニメスタジオ**：レンダリングファーム需要
- **ゲーム開発会社**：テスト、ビルド、CI/CD
- **ブロックチェーンプロジェクト**：ノード運用、ZK証明生成

---

## 第2部：プロダクトアーキテクチャ

### 2.1 両面マーケットモデル

```
┌─────────────────────────────────────────────────────────────┐
│                     JPYC決済レイヤー                         │
│   デポジット凍結/解除 | 超過課金 | 算力収益分配 | 出金        │
└─────────────────────────────────────────────────────────────┘
         ▲                                       ▲
         │                                       │
┌────────┴────────┐                   ┌─────────┴─────────┐
│  座席利用権市場   │                   │   遊休算力市場     │
│                  │                   │                   │
│ ユーザー購入     │                   │ 店舗が遊休PC登録   │
│     ↓           │                   │      ↓            │
│ 利用権Token     │                   │ 算力需要者が発注   │
│ (時間/回数)     │                   │      ↓            │
│     ↓           │                   │ タスク実行         │
│ 来店チェックイン │                   │      ↓            │
│     ↓           │                   │ JPYC決済          │
│ JPYC決済        │                   │      ↓            │
│                  │                   │ 収益分配          │
└──────────────────┘                   └───────────────────┘
```

### 2.2 コアデータモデル

#### A. 座席利用権サイド

```typescript
// 店舗エンティティ
// 店舗の基本情報と規制対応設定を管理する
interface Venue {
  venueId: string;           // 店舗ID
  name: string;              // 店舗名
  address: string;           // 住所
  jurisdiction: {            // 法令/条例差分のキー
    country: 'JP';
    prefecture: string;      // 都道府県（例：東京都）
    city?: string;           // 市区町村（任意）
    ward?: string;           // 区（任意）
  };
  timezone: string;          // タイムゾーン（例：Asia/Tokyo）
  regulationProfile: {       // 条例・運用要件（地域差分を吸収）
    profileVersion: string;  // 適用バージョン（例：tokyo-2026-02）
    identityVerificationRequired: boolean; // 本人確認要否
    terminalUsageLogRequired: boolean;    // 端末利用記録要否
    piiRetentionYears: number;            // 個人情報・記録の保存年数（例：3）
    prohibitedFields: ('MY_NUMBER' | 'HEALTH_INFO')[]; // 取得/保存しない項目
    lateNightMinorPolicyVersion: string;  // 深夜/未成年制限ルール
  };
  operatingHours: {          // 営業時間
    open: string;            // 開店時刻
    close: string;           // 閉店時刻
    is24h: boolean;          // 24時間営業フラグ
  };
  lateNightLicense: boolean; // 深夜営業許可
  seatInventory: Seat[];     // 座席一覧
  computeNodesEnabled: boolean; // 算力提供有効化
}

// 端末（Terminal）エンティティ
// 条例要件（端末利用記録）に備え、座席と紐づく端末を監査可能に管理する
interface Terminal {
  terminalId: string;           // 端末ID
  venueId: string;              // 店舗ID
  seatId: string;               // 座席ID
  assetTag?: string;            // 店舗内管理番号（任意）
  fingerprintHash: string;      // 端末指紋（生値は保持しない）
  lastSeenAt?: Date;            // 最終稼働
}

// 座席エンティティ
// 個別座席の情報とハードウェアスペック（算力価格算定用）
interface Seat {
  seatId: string;            // 座席ID
  venueId: string;           // 所属店舗ID
  terminalId?: string;       // 紐づく端末ID（端末記録が必要な場合）
  type: 'OPEN' | 'BOOTH' | 'FLAT' | 'VIP'; // 座席タイプ
  specs: {                   // ハードウェア仕様
    cpu: string;             // CPU型番
    gpu: string;             // GPU型番
    vram: number;            // VRAM容量(GB)
    ram: number;             // メモリ容量(GB)
    storage: number;         // ストレージ容量(GB)
  };
  amenities: ('SHOWER' | 'DRINK_BAR' | 'FOOD')[]; // 付帯設備
  status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'COMPUTE_MODE';
}

// 料金プランエンティティ
// パック料金の設定と超過ルール
interface PricePlan {
  planId: string;            // プランID
  venueId: string;           // 対象店舗ID
  type: 'TIME_PACK' | 'HOURLY' | 'NIGHT_PACK' | 'SUBSCRIPTION';
  name: string;              // プラン名（例：「3時間パック」）
  baseDuration: number;      // 基本時間（分）
  basePriceMinor: number;    // 基本価格（JPYC最小単位の整数）
  overtimeRules: OvertimeRule[]; // 超過料金ルール
  includedAmenities: string[];   // 含まれる設備
  depositRequiredMinor: number; // 必要デポジット（JPYC最小単位の整数）
  transferable: boolean;     // 譲渡可否
  validDays: number;         // 有効期限（日数）
}

// 超過料金ルール
interface OvertimeRule {
  fromMinutes: number;       // 開始分数
  toMinutes: number;         // 終了分数
  ratePerUnitMinor: number;  // 単位あたり料金（JPYC最小単位の整数）
  unitMinutes: number;       // 課金単位（分）
}

// 利用権証明（AccessPass）
// ユーザーが保有する利用権。オンチェーン/オフチェーン両対応
interface AccessPass {
  passId: string;            // パスID
  ownerUserId: string;       // 所有者ユーザーID
  ownerWallet?: string;      // 所有者ウォレットアドレス（オプション）
  planId: string;            // 対応プランID
  venueId?: string;          // 対象店舗ID（nullなら複数店舗利用可）
  status: 'ACTIVE' | 'IN_USE' | 'CONSUMED' | 'EXPIRED' | 'TRANSFERRED' | 'SUSPENDED' | 'REFUNDED' | 'DISPUTED';
  remainingMinutes: number;  // 残り時間（分）
  depositStatus: 'NONE' | 'HELD' | 'PARTIALLY_CAPTURED' | 'RELEASED';
  depositAmountMinor: number; // デポジット額（JPYC最小単位の整数）
  kycVerified: boolean;      // 本人確認完了フラグ
  createdAt: Date;           // 作成日時
  expiresAt: Date;           // 有効期限
  chainRef?: {               // ブロックチェーン参照（オプション）
    tokenId: string;         // NFTトークンID
    contractAddress: string; // コントラクトアドレス
    txHash: string;          // ミントトランザクション
  };
}

// 利用セッション
// 1回の来店利用を記録
interface Session {
  sessionId: string;         // セッションID
  passId: string;            // 使用パスID
  reservationId?: string;    // 予約ID（任意）
  seatId: string;            // 利用座席ID
  terminalId?: string;       // 利用端末ID（条例で必要な場合）
  venueId: string;           // 店舗ID
  checkInAt: Date;           // チェックイン時刻
  checkOutAt?: Date;         // チェックアウト時刻
  status: 'PENDING' | 'IN_USE' | 'ENDED' | 'OVERTIME' | 'DISPUTED';
  usedMinutes: number;       // 使用時間（分）
  overtimeMinutes: number;   // 超過時間（分）
  charges: {                 // 課金内訳
    baseMinor: number;       // 基本料金（JPYC最小単位）
    overtimeMinor: number;   // 超過料金（JPYC最小単位）
    amenitiesMinor: number;  // 追加サービス（JPYC最小単位）
    damageMinor: number;     // 損害賠償（JPYC最小単位）
  };
  identityVerificationId?: string; // 本人確認記録（任意）
  evidence: {                // 監査・紛争対応のための証跡（改ざん検知可能に）
    checkInMethod: 'QR' | 'KIOSK' | 'STAFF';
    terminalUsageLogHash?: string; // 端末利用記録のハッシュ（必要な場合）
    capturedAt: Date;               // 証跡採取時刻
  };
}

// 予約（Reservation）
// 「予約後ノーショー」等のルールを機械的に実行するために必須
interface Reservation {
  reservationId: string;     // 予約ID
  userId: string;            // 予約者ユーザーID
  venueId: string;           // 店舗ID
  planId: string;            // プランID
  seatType?: Seat['type'];   // 希望席種（任意）
  startAt: Date;             // 予約開始
  endAt: Date;               // 予約終了
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW' | 'CHECKED_IN' | 'EXPIRED';
  depositHoldLedgerTxId?: string; // デポジット凍結の参照（任意）
  createdAt: Date;           // 作成日時
}

// 本人確認（IdentityVerification）
// 重要：本人確認に「マイナンバーカード」を使っても、個人番号（マイナンバー）自体は取得/保存しない
interface IdentityVerification {
  identityVerificationId: string; // 記録ID
  userId: string;                // ユーザーID
  venueId: string;               // 店舗ID
  method: 'DRIVER_LICENSE' | 'PASSPORT' | 'RESIDENCE_CARD' | 'MY_NUMBER_CARD' | 'OTHER';
  verifiedAt: Date;              // 確認日時
  verifier: 'STAFF' | 'KIOSK' | 'ONLINE';
  capturedFields: {              // 条例・運用上必要な範囲で保持（最小化する）
    name: string;
    birthDate: string;           // YYYY-MM-DD
    address: string;
  };
  evidenceHash?: string;         // 証跡（画像等）のハッシュ
  retentionUntil: Date;          // 保存期限（例：3年後）
}
```

#### B. 算力市場サイド

```typescript
// 算力ノード
// 算力提供として登録されたPC
interface ComputeNode {
  nodeId: string;            // ノードID
  seatId: string;            // 対応座席ID
  venueId: string;           // 店舗ID
  specs: {                   // ハードウェア仕様
    cpuModel: string;        // CPU型番
    cpuCores: number;        // CPUコア数
    gpuModel: string;        // GPU型番
    vram: number;            // VRAM(GB)
    ram: number;             // RAM(GB)
  };
  status: 'IDLE' | 'RESERVED' | 'COMPUTING' | 'OFFLINE';
  availableWindows: {        // 利用可能時間帯
    dayOfWeek: number;       // 曜日（0=日曜）
    startTime: string;       // 開始時刻
    endTime: string;         // 終了時刻
  }[];
  pricePerHourMinor: number; // 時間単価（JPYC最小単位の整数）
  minBookingHours: number;   // 最小予約時間
  maxBookingHours: number;   // 最大予約時間
  supportedTasks: ('ML_TRAINING' | 'RENDERING' | 'ZK_PROVING' | 'GENERAL')[];
}

// 算力ジョブ
// 算力需要者が提出するタスク
interface ComputeJob {
  jobId: string;             // ジョブID
  requesterId: string;       // 依頼者ID
  nodeId?: string;           // 割り当てノードID
  taskType: string;          // タスク種別
  taskSpec: {                // タスク仕様
    dockerImage?: string;    // Dockerイメージ
    command: string;         // 実行コマンド
    inputUri: string;        // 入力データURI
    outputUri: string;       // 出力先URI
    envVars: Record<string, string>; // 環境変数
  };
  status: 'PENDING' | 'ASSIGNED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  estimatedHours: number;    // 見積時間
  actualHours?: number;      // 実行時間
  priceMinor: number;        // 支払額（JPYC最小単位の整数）
  depositMinor: number;      // デポジット（JPYC最小単位の整数）
  startAt?: Date;            // 開始時刻
  endAt?: Date;              // 終了時刻
  resultHash?: string;       // 結果ハッシュ（検証用）
}

// 算力収益
// 店舗の算力レンタル収益
interface ComputeEarning {
  earningId: string;         // 収益ID
  venueId: string;           // 店舗ID
  nodeId: string;            // ノードID
  jobId: string;             // ジョブID
  grossMinor: number;        // 総収入（JPYC最小単位の整数）
  platformFeeMinor: number;  // プラットフォーム手数料（JPYC最小単位）
  netMinor: number;          // 純収入（JPYC最小単位）
  settledAt: Date;           // 決済日時
}
```

#### C. 決済レイヤー

```typescript
// 元帳（Ledger）
// 「転送ログ」ではなく「会計として追跡可能」なモデル（複式簿記 + 冪等 + 監査）にする
// ※MVPはオフチェーン台帳でもよいが、型/項目は将来の監査・対帳に耐える形で固定する

type CurrencyCode = 'JPYC';

interface Money {
  currency: CurrencyCode;
  amountMinor: number;       // 最小単位の整数（例：JPYCの最小単位）。小数で扱わない
}

interface LedgerAccount {
  accountId: string;
  ownerType: 'USER' | 'VENUE' | 'PLATFORM' | 'CLEARING';
  ownerId?: string;          // USER/VENUEの場合に使用
  currency: CurrencyCode;
  chainRef?: {               // オンチェーン連携する場合に付与
    // 重要：同じ「JPYC」でもチェーン/コントラクトが異なれば別資産として扱う（必ず記録する）
    chainId: number;
    tokenContractAddress: string;
  };
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
}

interface LedgerTransaction {
  ledgerTxId: string;
  type: 'PURCHASE' | 'DEPOSIT_HOLD' | 'DEPOSIT_CAPTURE' | 'DEPOSIT_RELEASE' | 'CHECKOUT_CHARGE' | 'REFUND' | 'PAYOUT' | 'COMPUTE_CHARGE';
  referenceType: 'PASS' | 'SESSION' | 'RESERVATION' | 'JOB';
  referenceId: string;
  status: 'PENDING' | 'POSTED' | 'FAILED' | 'REVERSED';
  idempotencyKey: string;    // purchase/checkout/refund/payout等の重複実行防止（API契約）
  requestHash: string;       // 同一キーで内容が変わった場合の検知
  externalTxHash?: string;   // オンチェーン実行時のtxHash
  createdAt: Date;
  postedAt?: Date;
}

interface LedgerEntry {
  entryId: string;
  ledgerTxId: string;
  accountId: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: Money;
  memo?: string;
}

// 送金・決済の副作用を確実に1回だけ実行するためのアウトボックス（任意だが推奨）
interface OutboxEvent {
  eventId: string;
  eventType: 'CHAIN_TRANSFER' | 'PAYOUT_REQUEST' | 'REFUND_REQUEST';
  ledgerTxId: string;
  status: 'NEW' | 'SENT' | 'CONFIRMED' | 'FAILED';
  createdAt: Date;
  lastTriedAt?: Date;
}

// 決済サマリー
// 店舗向け日次/週次/月次決済
interface Settlement {
  settlementId: string;      // 決済ID
  venueId: string;           // 店舗ID
  periodStart: Date;         // 期間開始
  periodEnd: Date;           // 期間終了
  seatRevenueMinor: number;  // 座席売上（JPYC最小単位）
  computeRevenueMinor: number; // 算力売上（JPYC最小単位）
  refundsMinor: number;      // 返金額（JPYC最小単位）
  feesMinor: number;         // 手数料（JPYC最小単位）
  netPayoutMinor: number;    // 純支払額（JPYC最小単位）
  status: 'PENDING' | 'CONFIRMED' | 'PAID';
}
```

---

## 第3部：主要ビジネスルール

### 3.1 座席利用ルール

#### 請求・精算方式（現実的な運用に合わせる）

- **分単位の計算はオフチェーンで実施**し、チェックアウト時に「一括で精算」する（オンチェーンの分単位マイクロ決済は前提にしない）
- 入店前/予約時に**デポジットを凍結（hold）**し、離店時に実額を**捕捉（capture）**、差額を**解除（release）**する
- 料金は「最安となるパックへ自動切替（自動アップグレード）」を前提にし、説明可能な請求明細を出す
- チェックアウト未実施（無断退出/通信断）に備え、一定時間後の自動精算と紛争フローを定義する

#### 本人確認・端末利用記録・保存（条例/運用要件）

- `Venue.regulationProfile` により、本人確認要否・端末利用記録要否・保存年数・記録禁止項目を切り替える
- 本人確認は `IdentityVerification` として独立管理し、**個人番号（マイナンバー）等の禁止項目は取得/保存しない**
- 監査・紛争対応のため、`Session.evidence` に「いつ/誰が/どの方法で」チェックインしたかを残し、端末利用記録が必要な場合はハッシュで参照する

#### 超過課金階段（標準設定）

| 超過時間 | 料金 | 備考 |
|----------|------|------|
| 0〜10分 | 無料 | バッファ時間（着替え、精算準備） |
| 11〜30分 | 100 JPYC/10分 | 短時間超過 |
| 31〜60分 | 150 JPYC/10分 | 中程度超過 |
| 60分以上 | 次のパックに自動アップグレード | 無限累積防止 |
| 単回上限 | 元料金×1.5 | ユーザー心理的安全性 |

#### キャンセル/返金ルール

| タイミング | 返金率 | 処理 |
|------------|--------|------|
| 未使用 + 有効期限内 | 100%（手数料3%控除） | 自動返金 |
| 一部使用済み | 残り時間比例 | 自動計算 |
| 期限切れ未使用 | 0%（ポイント転換オプション） | 自動失効 |
| 予約後ノーショー | 30%キャンセル料 | デポジットから控除 |

#### 譲渡ルール

- **月額プラン**：譲渡不可（KYC紐付け）
- **時間パック**：譲渡可、ただし24時間クールダウン期間（マネロン防止）
- 譲渡後、元所有者のKYCは継承されず、新所有者は再確認が必要
- プラットフォーム手数料：譲渡価格の5%

### 3.2 算力市場ルール

#### ノード参入要件

- 最低スペック：GTX 1660以上 / 16GB RAM / 安定したネットワーク
- プラットフォームAgentソフトウェアのインストール必須（タスクスケジューリング、監視、結果報告）
- 店舗が利用可能時間帯を設定（客足ピーク時を避ける）
- 自動検知：座席がユーザーにチェックインされた場合、即座に算力タスクを中断

#### タスクスケジューリング優先度

1. **ユーザー利用権**（絶対優先）
2. 予約済み算力タスク
3. リアルタイム入札タスク（Spot）

#### 収益分配

| 役割 | 分配率 | 説明 |
|------|--------|------|
| ネットカフェ店舗 | 75% | ハードウェアと電力提供 |
| プラットフォーム | 25% | スケジューリング、決済、サポート（決済コストの負担含む） |

※決済コスト（Gas、換金/出金、流動性等）は「固定5%」のように扱わず、実費として設計する（誰が負担するかを明示する）。

#### タスク失敗/中断処理

- **ユーザー着席による中断**：タスクを別ノードへマイグレーション、完了分は按分決済
- **ハードウェア障害**：需要者へ全額返金、店舗は収益なし
- **需要者キャンセル**：実行時間に応じた按分課金

---

## 第4部：API設計

### 4.0 決済系API共通規約（冪等）

- `/passes/purchase` `/sessions/checkout` `/refund` `/payout` `/compute/jobs` 等、資金副作用のあるAPIは **`Idempotency-Key` を必須**にする
- サーバー側は `Idempotency-Key → requestHash → ledgerTxId/レスポンス` を保存し、タイムアウト/再送でも**二重課金しない**
- レスポンスには `ledgerTxId`（または `paymentIntentId`）を返し、クライアントはリトライ時に同じキーを使う

### 4.1 ユーザー向けAPI

| エンドポイント | メソッド | 説明 |
|----------------|----------|------|
| `/v1/venues` | GET | 近隣店舗検索。空席状況・料金・評価を返す |
| `/v1/venues/:venueId/plans` | GET | 指定店舗の料金プラン一覧を取得 |
| `/v1/passes/purchase` | POST | 利用権を購入（入力：planId, venueId, paymentMethod） |
| `/v1/identity/verify` | POST | 本人確認（入力：本人確認情報/証跡、出力：identityVerificationId） |
| `/v1/sessions/checkin` | POST | チェックイン（入力：passId, seatId, identityVerificationId?） |
| `/v1/sessions/checkout` | POST | チェックアウト（出力：usedMinutes, charges） |
| `/v1/passes/:passId/transfer` | POST | 利用権譲渡 |
| `/v1/user/balance` | GET | JPYC残高・デポジット状況を照会 |

### 4.2 店舗向けAPI

| エンドポイント | メソッド | 説明 |
|----------------|----------|------|
| `/v1/merchant/venues` | POST | 店舗登録 |
| `/v1/merchant/venues/:venueId/seats` | POST/PUT | 座席管理（追加/更新） |
| `/v1/merchant/venues/:venueId/plans` | POST/PUT | 料金プラン設定 |
| `/v1/merchant/venues/:venueId/compute/enable` | POST | 算力提供有効化、利用可能時間帯設定 |
| `/v1/merchant/settlements` | GET | 決済照会（座席+算力収入サマリー） |
| `/v1/merchant/disputes` | GET/POST | 紛争照会・申立て |

### 4.3 算力市場API

| エンドポイント | メソッド | 説明 |
|----------------|----------|------|
| `/v1/compute/nodes` | GET | 利用可能ノード検索 |
| `/v1/compute/jobs` | POST | ジョブ提出 |
| `/v1/compute/jobs/:jobId` | GET | ジョブ状態照会 |
| `/v1/compute/jobs/:jobId/cancel` | POST | ジョブキャンセル |
| `/v1/compute/jobs/:jobId/result` | GET | 結果取得 |

---

## 第5部：なぜJPYCが不可欠なのか

### 5.1 座席利用権シーン

| 要件 | 従来決済の課題 | JPYCの解決策 |
|------|---------------|-------------|
| デポジット凍結/解除 | クレジットカード事前承認は有効期限あり、現金は人手が必要 | デポジットの凍結（hold）→離店時の捕捉（capture）→差額解除（release）を自動化 |
| 分単位の超過課金 | 最小課金単位の制限、頻繁な少額決済は手数料が高い | 分単位の計算はオフチェーンで行い、チェックアウト時にまとめて精算（必要ならデポジットから捕捉） |
| 複数店舗共通残高 | 各店の会員システムが独立、残高は共有されない | JPYC残高は全ネットワーク共通 |
| 利用権譲渡 | 紙券や電子券の安全な譲渡が困難 | オンチェーン譲渡 + ルール制約 + プラットフォーム手数料 |

### 5.2 算力レンタルシーン

| 要件 | 従来決済の課題 | JPYCの解決策 |
|------|---------------|-------------|
| 時間/タスク単位決済 | 銀行振込はT+1、越境はさらに遅延 | タスク完了時に準リアルタイム決済（確定時間はチェーン/運用に依存） |
| 自動分配（店舗/プラットフォーム） | 手動照合が必要、エラーが起きやすい | スマートコントラクトで自動按分 |
| タスク保証金 | 少額・短期の保証金メカニズムが困難 | タスク開始時に凍結、完了後に解除/控除 |
| グローバル算力需要者 | 越境決済は複雑で手数料が高い | 円建てで価格を固定しやすい（越境/換金/受領は法務・税務の整理が前提） |

### 5.3 ネットワーク効果の論証

```
第1段階（単店舗）
  店舗が接続 → 座席利用権トークン化 → 超過自動決済 → 紛争・人件費削減
      ↓
第2段階（チェーン）
  複数店舗が接続 → 複数店舗共通利用権 → ユーザー粘着性向上 → 店舗は高いプラットフォーム料を許容
      ↓
第3段階（算力ネットワーク）
  遊休マシンがオンライン化 → 算力需要者が流入 → 店舗が追加収入を獲得 → さらに多くの店舗が接続
      ↓
第4段階（エコシステム）
  JPYCがネットカフェ業界の決済標準に → 周辺サービス（出前、印刷、ゲーム課金）が接続 → クローズドエコノミー形成
```

---

## 第6部：MVPロードマップ

### Phase 1：座席利用権（3ヶ月）

| 項目 | 内容 |
|------|------|
| **目標** | 1〜2店舗と提携し、コアフローを検証 |
| **機能** | パック購入 → QRチェックイン/アウト → 超過課金 → 店舗向け精算レポート |
| **技術** | オフチェーン台帳 + JPYC決済 + シンプルなWebアプリ |
| **KPI** | アクティブユーザー100人以上、紛争率5%未満 |

### Phase 2：複数店舗共通 + 譲渡（+3ヶ月）

| 項目 | 内容 |
|------|------|
| **目標** | 5〜10店舗のネットワークを形成 |
| **機能** | 複数店舗共通利用権、P2P譲渡マーケット、会員ランク |
| **技術** | 利用権NFT化（オプション）、譲渡スマートコントラクト |
| **KPI** | ユーザー500人以上、月間取引額100万JPYC以上 |

### Phase 3：算力市場Beta（+3ヶ月）

| 項目 | 内容 |
|------|------|
| **目標** | 10台以上のマシンが算力市場にオンライン化 |
| **機能** | ノード登録、ジョブ提出、自動スケジューリング、収益分配 |
| **技術** | Agentソフトウェア、タスクキュー、結果検証 |
| **KPI** | 月間算力収入50万JPYC以上 |

### Phase 4：スケール化（+6ヶ月）

| 項目 | 内容 |
|------|------|
| **目標** | 50店舗以上、1000ノード以上 |
| **機能** | API公開、サードパーティ接続、派生金融商品（利用権担保等） |
| **パートナー** | JPYCとの深度提携、ネットカフェチェーンからの戦略投資 |

---

## 第7部：リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| ネットカフェ店舗の導入意欲が低い | コールドスタート失敗 | 独立店舗から切り込む、無料トライアル期間を提供、算力収入をインセンティブに |
| 規制/法務リスク（電子決済手段・資金移動・本人確認/記録保存・越境受領など） | 機能制限、運用停止、追加コスト | 要法務相談を前提化。ノンカストディ/カストディ方針を決め、影響が大きい機能（共通残高/譲渡/出金/越境）を機能フラグで段階展開 |
| 本人確認・端末利用記録・保存期限の不備 | 行政対応、監査不適合、紛争増加 | `regulationProfile` に基づくデータ最小化、権限制御、改ざん検知できる証跡、保存/削除ジョブ（期限到来で確実に削除） |
| 算力タスクのセキュリティリスク | 悪意あるコード、プライバシー漏洩 | サンドボックス実行環境、タスク審査メカニズム、店舗が特定タスク種別を拒否可能 |
| ユーザーが暗号通貨を使いたがらない | コンバージョン率低下 | カストディアルウォレット + 法定通貨入金チャネル、「チェーンを意識しない」UX設計 |
| 既存POS/会員システムとの競合 | 店舗の改修コストが高い | API連携方式を提供、初期は「増分チャネル」として位置付け |

---

## 付録A：フロントエンドUI文言サンプル

### 共通コンポーネント

```typescript
// components/common/labels.ts
// 共通ラベル定義

export const LABELS = {
  // ナビゲーション
  nav: {
    home: 'ホーム',
    search: '店舗を探す',
    myPasses: 'マイパス',
    history: '利用履歴',
    settings: '設定',
    help: 'ヘルプ',
  },
  
  // 認証
  auth: {
    login: 'ログイン',
    logout: 'ログアウト',
    register: '新規登録',
    forgotPassword: 'パスワードを忘れた方',
    connectWallet: 'ウォレット接続',
    disconnectWallet: 'ウォレット切断',
  },
  
  // ボタン
  button: {
    purchase: '購入する',
    checkin: 'チェックイン',
    checkout: 'チェックアウト',
    cancel: 'キャンセル',
    confirm: '確認',
    back: '戻る',
    next: '次へ',
    submit: '送信',
    transfer: '譲渡する',
    retry: '再試行',
  },
  
  // ステータス
  status: {
    active: '有効',
    inUse: '利用中',
    expired: '期限切れ',
    consumed: '使用済み',
    transferred: '譲渡済み',
    pending: '処理中',
    completed: '完了',
    failed: '失敗',
  },
  
  // 座席タイプ
  seatType: {
    open: 'オープン席',
    booth: 'ブース席',
    flat: 'フラット席',
    vip: 'VIP席',
  },
  
  // 料金関連
  pricing: {
    basePrice: '基本料金',
    overtime: '超過料金',
    deposit: 'デポジット',
    total: '合計',
    tax: '税込',
    perHour: '/時間',
    perMinute: '/分',
  },
};
```

### エラーメッセージ

```typescript
// constants/errorMessages.ts
// エラーメッセージ定義

export const ERROR_MESSAGES = {
  // 認証エラー
  auth: {
    invalidCredentials: 'メールアドレスまたはパスワードが正しくありません',
    sessionExpired: 'セッションが切れました。再度ログインしてください',
    walletConnectionFailed: 'ウォレット接続に失敗しました',
    insufficientBalance: 'JPYC残高が不足しています',
  },
  
  // 利用権エラー
  pass: {
    notFound: '指定されたパスが見つかりません',
    expired: 'このパスは有効期限が切れています',
    alreadyInUse: 'このパスは現在使用中です',
    notTransferable: 'このパスは譲渡できません',
    cooldownActive: '譲渡クールダウン期間中です',
  },
  
  // チェックイン/アウトエラー
  session: {
    seatUnavailable: 'この座席は現在利用できません',
    checkinFailed: 'チェックインに失敗しました。スタッフにお声がけください',
    checkoutFailed: 'チェックアウトに失敗しました。スタッフにお声がけください',
    kycRequired: '本人確認が必要です',
  },
  
  // 決済エラー
  payment: {
    transactionFailed: '決済処理に失敗しました',
    depositCaptureFailed: 'デポジットの処理に失敗しました',
    refundFailed: '返金処理に失敗しました',
  },
  
  // 汎用エラー
  general: {
    networkError: 'ネットワークエラーが発生しました。接続を確認してください',
    serverError: 'サーバーエラーが発生しました。しばらくしてから再試行してください',
    unknownError: '予期しないエラーが発生しました',
  },
};
```

### 確認ダイアログ

```typescript
// constants/confirmDialogs.ts
// 確認ダイアログ定義

export const CONFIRM_DIALOGS = {
  purchase: {
    title: '購入確認',
    message: (planName: string, price: number) => 
      `「${planName}」を${price} JPYCで購入しますか？`,
    confirmButton: '購入する',
    cancelButton: 'キャンセル',
  },
  
  checkout: {
    title: 'チェックアウト確認',
    message: (usedMinutes: number, charges: number) =>
      `利用時間: ${usedMinutes}分\n請求額: ${charges} JPYC\n\nチェックアウトしますか？`,
    confirmButton: 'チェックアウト',
    cancelButton: '続ける',
  },
  
  transfer: {
    title: '譲渡確認',
    message: (passName: string, toUser: string) =>
      `「${passName}」を ${toUser} さんに譲渡しますか？\n\n※この操作は取り消せません`,
    confirmButton: '譲渡する',
    cancelButton: 'キャンセル',
  },
  
  cancel: {
    title: 'キャンセル確認',
    message: (fee: number) =>
      `キャンセル手数料 ${fee} JPYC が発生します。\n\n本当にキャンセルしますか？`,
    confirmButton: 'キャンセルする',
    cancelButton: '戻る',
  },
};
```

---

## 付録B：コード内コメント規約

### コメント言語

すべてのコメントは日本語で記述すること。

```typescript
// ✅ 正しい例
// ユーザーの残高を取得する
const balance = await getBalance(userId);

// ❌ 間違った例
// Get user balance
const balance = await getBalance(userId);
```

### JSDoc形式

```typescript
/**
 * 利用権を購入する
 * @param userId - ユーザーID
 * @param planId - 料金プランID
 * @param paymentMethod - 支払い方法
 * @returns 発行されたパス情報
 * @throws InsufficientBalanceError - 残高不足の場合
 */
async function purchasePass(
  userId: string,
  planId: string,
  paymentMethod: PaymentMethod
): Promise<AccessPass> {
  // デポジット額を計算
  const plan = await getPlan(planId);
  const totalAmount = plan.basePrice + plan.depositRequired;
  
  // 残高確認
  const balance = await getBalance(userId);
  if (balance < totalAmount) {
    throw new InsufficientBalanceError('JPYC残高が不足しています');
  }
  
  // 決済処理
  await processPayment(userId, totalAmount);
  
  // パス発行
  const pass = await createPass(userId, planId);
  
  return pass;
}
```

### Solidityコメント

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title AccessPassNFT
 * @notice ネットカフェ利用権を表すNFTコントラクト
 * @dev ERC721を継承し、利用権の譲渡・消費を管理する
 */
contract AccessPassNFT is ERC721, Ownable {
    
    // パス情報を格納する構造体
    struct PassData {
        uint256 planId;        // 料金プランID
        uint256 venueId;       // 対象店舗ID（0なら複数店舗利用可）
        uint256 remainingMinutes; // 残り時間（分）
        uint256 expiresAt;     // 有効期限（UNIXタイムスタンプ）
        bool isActive;         // 有効フラグ
    }
    
    // トークンIDからパス情報へのマッピング
    mapping(uint256 => PassData) public passes;
    
    // 譲渡クールダウン期間（24時間）
    uint256 public constant TRANSFER_COOLDOWN = 24 hours;
    
    // 最後の譲渡時刻を記録
    mapping(uint256 => uint256) public lastTransferTime;
    
    /**
     * @notice パスを消費（チェックアウト時に呼び出し）
     * @param tokenId 対象トークンID
     * @param usedMinutes 使用した時間（分）
     */
    function consumePass(uint256 tokenId, uint256 usedMinutes) external onlyOperator {
        PassData storage pass = passes[tokenId];
        
        // 有効性チェック
        require(pass.isActive, "パスが無効です");
        require(block.timestamp < pass.expiresAt, "パスの有効期限が切れています");
        
        // 残り時間を減算
        if (usedMinutes >= pass.remainingMinutes) {
            pass.remainingMinutes = 0;
            pass.isActive = false; // 使い切ったら無効化
        } else {
            pass.remainingMinutes -= usedMinutes;
        }
        
        emit PassConsumed(tokenId, usedMinutes, pass.remainingMinutes);
    }
    
    /**
     * @notice 譲渡前のフック（クールダウンチェック）
     * @dev ERC721の_beforeTokenTransferをオーバーライド
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
        
        // ミント時（from == address(0)）はスキップ
        if (from != address(0)) {
            // クールダウン期間チェック
            require(
                block.timestamp >= lastTransferTime[tokenId] + TRANSFER_COOLDOWN,
                "譲渡クールダウン期間中です"
            );
            
            // 譲渡時刻を記録
            lastTransferTime[tokenId] = block.timestamp;
        }
    }
}
```

---

## 付録C：推奨プロジェクト構成

```
netcafe-jpyc/
├── apps/
│   ├── web/                    # ユーザー向けWebアプリ（Next.js）
│   │   ├── app/
│   │   │   ├── (auth)/         # 認証関連ページ
│   │   │   ├── (main)/         # メインページ
│   │   │   │   ├── venues/     # 店舗検索・詳細
│   │   │   │   ├── passes/     # マイパス管理
│   │   │   │   ├── sessions/   # チェックイン/アウト
│   │   │   │   └── transfer/   # 譲渡マーケット
│   │   │   └── api/            # APIルート
│   │   ├── components/         # UIコンポーネント
│   │   ├── hooks/              # カスタムフック
│   │   ├── lib/                # ユーティリティ
│   │   └── constants/          # 定数・ラベル定義
│   │
│   ├── merchant/               # 店舗向け管理画面（Next.js）
│   │   ├── app/
│   │   │   ├── dashboard/      # ダッシュボード
│   │   │   ├── seats/          # 座席管理
│   │   │   ├── plans/          # 料金プラン管理
│   │   │   ├── compute/        # 算力設定
│   │   │   └── settlements/    # 精算・レポート
│   │   └── ...
│   │
│   └── compute-agent/          # 算力ノードAgent（Node.js/Go）
│       ├── src/
│       │   ├── scheduler/      # タスクスケジューラ
│       │   ├── executor/       # タスク実行エンジン
│       │   ├── monitor/        # リソース監視
│       │   └── reporter/       # 結果報告
│       └── ...
│
├── packages/
│   ├── contracts/              # Solidityコントラクト
│   │   ├── src/
│   │   │   ├── AccessPassNFT.sol
│   │   │   ├── DepositVault.sol
│   │   │   └── ComputeMarket.sol
│   │   ├── test/
│   │   └── deploy/
│   │
│   ├── sdk/                    # クライアントSDK（TypeScript）
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── types.ts
│   │   │   └── utils.ts
│   │   └── ...
│   │
│   ├── ui/                     # 共通UIコンポーネント
│   │   ├── components/
│   │   └── styles/
│   │
│   └── config/                 # 共通設定
│       ├── eslint/
│       ├── typescript/
│       └── tailwind/
│
├── services/
│   └── api/                    # バックエンドAPI（NestJS）
│       ├── src/
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── venues/
│       │   │   ├── passes/
│       │   │   ├── sessions/
│       │   │   ├── compute/
│       │   │   └── settlements/
│       │   ├── common/
│       │   └── prisma/
│       └── ...
│
├── infrastructure/
│   ├── docker/
│   ├── kubernetes/
│   └── terraform/
│
└── docs/
    ├── api/                    # API仕様書
    ├── contracts/              # コントラクト仕様書
    └── guides/                 # 開発ガイド
```

---

## 付録D：Polygon設定

### ネットワーク設定

```typescript
// config/chains.ts
// ブロックチェーンネットワーク設定

import { polygon, polygonAmoy } from 'wagmi/chains';

// 本番環境：Polygon Mainnet
export const MAINNET_CONFIG = {
  chain: polygon,
  rpcUrl: 'https://polygon-rpc.com',
  blockExplorer: 'https://polygonscan.com',
  jpycAddress: '0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB', // JPYC v2
};

// テスト環境：Polygon Amoy Testnet
export const TESTNET_CONFIG = {
  chain: polygonAmoy,
  rpcUrl: 'https://rpc-amoy.polygon.technology',
  blockExplorer: 'https://amoy.polygonscan.com',
  jpycAddress: '0x...', // テスト用JPYCアドレス（要デプロイ）
};

// MVP開発環境ではTestnetを使用
export const CURRENT_CONFIG = process.env.NODE_ENV === 'production' 
  ? MAINNET_CONFIG 
  : TESTNET_CONFIG;
```

### コントラクトデプロイ

```typescript
// scripts/deploy.ts
// コントラクトデプロイスクリプト

import { ethers } from 'hardhat';

async function main() {
  console.log('デプロイを開始します...');
  
  // AccessPassNFTをデプロイ
  const AccessPassNFT = await ethers.getContractFactory('AccessPassNFT');
  const accessPass = await AccessPassNFT.deploy('NetCafe Pass', 'NCP');
  await accessPass.deployed();
  console.log(`AccessPassNFT デプロイ完了: ${accessPass.address}`);
  
  // DepositVaultをデプロイ
  const DepositVault = await ethers.getContractFactory('DepositVault');
  const depositVault = await DepositVault.deploy(CURRENT_CONFIG.jpycAddress);
  await depositVault.deployed();
  console.log(`DepositVault デプロイ完了: ${depositVault.address}`);
  
  // 初期設定
  await accessPass.setOperator(depositVault.address);
  console.log('オペレータ設定完了');
  
  console.log('デプロイが正常に完了しました');
}

main().catch((error) => {
  console.error('デプロイエラー:', error);
  process.exitCode = 1;
});
```

### Hardhat設定

```typescript
// hardhat.config.ts
// Hardhat設定ファイル

import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.19',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // ローカル開発
    hardhat: {
      chainId: 31337,
    },
    // Polygon Amoy テストネット
    polygonAmoy: {
      url: 'https://rpc-amoy.polygon.technology',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 80002,
    },
    // Polygon メインネット
    polygon: {
      url: 'https://polygon-rpc.com',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 137,
    },
  },
  etherscan: {
    apiKey: {
      polygon: process.env.POLYGONSCAN_API_KEY || '',
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || '',
    },
  },
};

export default config;
```

---

## 付録E：環境変数テンプレート

```bash
# .env.example
# 環境変数テンプレート

# ========================================
# データベース
# ========================================
DATABASE_URL="postgresql://user:password@localhost:5432/netcafe_jpyc"
REDIS_URL="redis://localhost:6379"

# ========================================
# 認証
# ========================================
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# ========================================
# ブロックチェーン
# ========================================
# デプロイ用秘密鍵（本番環境ではHSM使用推奨）
PRIVATE_KEY="0x..."

# RPCエンドポイント
POLYGON_RPC_URL="https://polygon-rpc.com"
POLYGON_AMOY_RPC_URL="https://rpc-amoy.polygon.technology"

# コントラクトアドレス
ACCESS_PASS_NFT_ADDRESS="0x..."
DEPOSIT_VAULT_ADDRESS="0x..."
JPYC_ADDRESS="0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB"

# Polygonscan API（コントラクト検証用）
POLYGONSCAN_API_KEY="your-api-key"

# ========================================
# 外部サービス
# ========================================
# Sentry（エラー追跡）
SENTRY_DSN="https://..."

# ========================================
# 機能フラグ
# ========================================
ENABLE_COMPUTE_MARKET="false"  # Phase 3で有効化
ENABLE_TRANSFER_MARKET="false" # Phase 2で有効化
```

---

*ドキュメント最終更新: 2026年3月*
