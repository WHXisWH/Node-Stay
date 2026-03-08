# NodeStay Database Schema + PRD v2
バージョン: v2.0 ドラフト
目標: 上記 5 つのドキュメントに基づいて、アプリケーション層 PRD v2 + データベース構造を実装する

---

## Part A. PRD v2

## 1. 製品の目標

NodeStay v2 の目標は次のとおりです。

1. サポートマシン資産登録
2. 使用権の販売、購入、譲渡、償却をサポートする
3. ComputeRight と RevenueRight の構造を予約する
4. JPYC 支払い、オンチェーン記録、オフチェーン会話のクローズド ループを実行する
5. その後の所得分配と流通市場拡大の基礎を築く

---

## 2. 現在のバージョンの範囲

### 2.1 v2 を実装する必要があります
- マシンの登録はマシンルートに対応します
- チェーン上での使用権の発行
- ユーザーが使用権を購入する
- JPYC決済
- check-in / check-out
- 基本的なマーケットプレイス出品
- リスク管理とKYCレベルゲート
- 操作ログとリコンシリエーションバックエンド

### 2.2 v2 は予約されていますが、完全に起動することは必須ではありません。
- ComputeRight は閉ループを完全に実行します
- 収益権流通市場
- 完全に自動化された動的価格設定
- 高度な紛争プロセス

---

## 3. 主要な役割

- Merchant / Venue Owner
- Consumer / User
- Investor
- Compute Buyer
- Admin / Ops
- Risk / Compliance

---

## 4. コアビジネスフロー

### 4.1 マシンの登録
マーチャントが会場を登録 → マシンに入る → チェーン上の MachineRegistry を呼び出す → マシンのルート データを書き戻す

### 4.2 使用権の販売
販売者が期間商品を設定 → プラットフォームが使用スロットを生成 → 契約ミントを呼び出します 使用権 → ユーザーが購入できる

### 4.3 使用法正しい使用法
ユーザーがUsageRightを保持→店舗へチェックイン→セッション開始→チェックアウト→決済完了

### 4.4 二次転写
ユーザーのUsageRightのリスト化 → 他人による購入 → チェーン上の所有権の移転 → プラットフォームの記録のリスト化とトランザクション

### 4.5 コンピューティング / 収益は予約済み
データベース構造とマシンのバックエンドエントリを保持 → スロット/収益の発行を計算

---

## 5. PRD v2 ページ モジュール

### 5.1 消費者側
- ホーム / 発見
- Venue Detail
- Machine / Usage Slot Detail
- 私の資産 (使用量/コンピューティング/収益)
- 私の注文
- 私のセッション
- 資産譲渡・上場
- 残高および決済記録

### 5.2 販売者側
- 会場運営
- マシン管理
- 利用商品・期間の設定
- 売上・決済ダッシュボード
- 機械の使用率と収益の分析
- 予約コンピューティング/レベニュー構成の入り口

### 5.3 管理者側
- ユーザー管理
- KYCレベル管理
- リスク管理の凍結
- 紛争管理
- オンチェーントランザクションの領収書
- 和解調停

---

## 6. 主要なビジネス ルール

### 6.1 使用権の譲渡
-単一パッケージ転送がデフォルトでサポートされています
- 月額サブスクリプションは譲渡できません
- チェックインは譲渡不可です
- 転送期限を超えて転送することはできません

### 6.2 check-in
- ユーザーは有効な使用権を保持している必要があります
- 会場でKYCが必要な場合は、レベルを満たしている必要があります
- セッション開始後、UsageRight ステータスが CHECKED_IN に更新されます

### 6.3 check-out
- セッションの終了
- 実際の決済金額の計算
- 通話決済記録
-UsageRight が CONSUMED または PARTIAL_CONSUMED に更新されました (将来サポートされる場合)

### 6.4 Refund / Cancel
- ポリシーによって処理される
- キャンセルにはオンチェーンステータスとローカル注文ステータスの同期が必要です

---

## Part B. PostgreSQL Schema Draft

## 7. 基本テーブル

### 7.1 users
```sql
create table users (
  id uuid primary key,
  wallet_address text unique,
  email text unique,
  phone text unique,
  display_name text,
  kyc_level int not null default 0,
  kyc_proof_hash text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 7.2 merchants
```sql
create table merchants (
  id uuid primary key,
  name text not null,
  owner_user_id uuid references users(id),
  treasury_wallet text,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 7.3 venues
```sql
create table venues (
  id uuid primary key,
  merchant_id uuid not null references merchants(id),
  name text not null,
  country text not null default 'JP',
  prefecture text,
  city text,
  address text,
  timezone text not null default 'Asia/Tokyo',
  venue_id_hash text,
  requires_kyc boolean not null default false,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

## 8. マシン資産関連のテーブル

### 8.1 machines
```sql
create table machines (
  id uuid primary key,
  venue_id uuid not null references venues(id),
  machine_id text unique not null,
  local_serial text,
  hardware_fingerprint_hash text,
  owner_wallet text,
  machine_class text not null,
  cpu text,
  gpu text,
  ram_gb int,
  storage_gb int,
  spec_hash text,
  metadata_uri text,
  onchain_token_id text,
  onchain_tx_hash text,
  status text not null default 'REGISTERED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_machines_venue_id on machines(venue_id);
create index idx_machines_status on machines(status);
```

### 8.2 machine_slots
使用量とコンピューティングの二重販売を避けるために時間枠の占有を管理するために使用されます。

```sql
create table machine_slots (
  id uuid primary key,
  machine_id uuid not null references machines(id),
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  slot_type text not null, -- USAGE / COMPUTE / BLOCKED
  occupancy_status text not null default 'FREE', -- FREE / RESERVED / CONSUMED / BLOCKED
  reference_type text, -- USAGE_RIGHT / COMPUTE_RIGHT / SESSION
  reference_id uuid,
  created_at timestamptz not null default now()
);
create index idx_machine_slots_machine_time on machine_slots(machine_id, slot_start, slot_end);
```

---

## 9. 使用権関連表

### 9.1 usage_products
```sql
create table usage_products (
  id uuid primary key,
  venue_id uuid not null references venues(id),
  machine_id uuid references machines(id),
  product_name text not null,
  usage_type text not null, -- HOURLY / PACK / NIGHT / FLEX
  start_at timestamptz,
  end_at timestamptz,
  duration_minutes int,
  transferable boolean not null default true,
  transfer_cutoff_minutes int default 60,
  max_transfer_count int default 1,
  kyc_level_required int default 0,
  price_jpyc numeric(30, 0) not null,
  metadata_uri text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 9.2 usage_rights
```sql
create table usage_rights (
  id uuid primary key,
  usage_product_id uuid not null references usage_products(id),
  machine_id uuid references machines(id),
  owner_user_id uuid references users(id),
  onchain_token_id text unique,
  onchain_tx_hash text,
  start_at timestamptz,
  end_at timestamptz,
  transferable boolean not null default true,
  transfer_cutoff_at timestamptz,
  transfer_count int not null default 0,
  max_transfer_count int not null default 1,
  kyc_level_required int not null default 0,
  status text not null, -- MINTED / LISTED / LOCKED / CHECKED_IN / CONSUMED / EXPIRED / CANCELLED
  metadata_uri text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_usage_rights_owner on usage_rights(owner_user_id);
create index idx_usage_rights_status on usage_rights(status);
create index idx_usage_rights_time on usage_rights(start_at, end_at);
```

### 9.3 usage_listings
```sql
create table usage_listings (
  id uuid primary key,
  usage_right_id uuid not null references usage_rights(id),
  seller_user_id uuid not null references users(id),
  price_jpyc numeric(30, 0) not null,
  expiry_at timestamptz,
  status text not null default 'ACTIVE', -- ACTIVE / CANCELLED / SOLD / EXPIRED
  buyer_user_id uuid references users(id),
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

## 10. セッション関連テーブル

### 10.1 sessions
```sql
create table sessions (
  id uuid primary key,
  usage_right_id uuid not null references usage_rights(id),
  user_id uuid not null references users(id),
  venue_id uuid not null references venues(id),
  machine_id uuid references machines(id),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  status text not null default 'PENDING', -- PENDING / IN_USE / COMPLETED / DISPUTED / CANCELLED
  checkin_method text,
  evidence_hash text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_sessions_user on sessions(user_id);
create index idx_sessions_machine on sessions(machine_id);
```

---

## 11. 予約済みテーブルの計算

### 11.1 compute_products
```sql
create table compute_products (
  id uuid primary key,
  machine_id uuid not null references machines(id),
  compute_tier text not null,
  start_window timestamptz not null,
  end_window timestamptz not null,
  max_duration_minutes int not null,
  preemptible boolean not null default true,
  settlement_policy text not null,
  price_jpyc numeric(30, 0) not null,
  metadata_uri text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now()
);
```

### 11.2 compute_rights
```sql
create table compute_rights (
  id uuid primary key,
  compute_product_id uuid not null references compute_products(id),
  machine_id uuid not null references machines(id),
  owner_user_id uuid references users(id),
  onchain_token_id text unique,
  onchain_tx_hash text,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 11.3 compute_jobs
```sql
create table compute_jobs (
  id uuid primary key,
  compute_right_id uuid references compute_rights(id),
  buyer_user_id uuid references users(id),
  job_id_hash text unique,
  job_type text,
  scheduler_ref text,
  status text not null default 'PENDING',
  started_at timestamptz,
  ended_at timestamptz,
  result_hash text,
  interruption_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

## 12. 収益予約表

### 12.1 revenue_programs
```sql
create table revenue_programs (
  id uuid primary key,
  machine_id uuid not null references machines(id),
  share_bps int not null,
  revenue_scope text not null, -- USAGE_ONLY / COMPUTE_ONLY / ALL
  start_at timestamptz not null,
  end_at timestamptz not null,
  settlement_cycle text not null, -- DAILY / WEEKLY / MONTHLY
  payout_token text not null default 'JPYC',
  metadata_uri text,
  status text not null default 'ISSUED',
  created_at timestamptz not null default now()
);
```

### 12.2 revenue_rights
```sql
create table revenue_rights (
  id uuid primary key,
  revenue_program_id uuid not null references revenue_programs(id),
  holder_user_id uuid references users(id),
  onchain_token_id text,
  amount_1155 numeric(30, 0),
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 12.3 revenue_allocations
```sql
create table revenue_allocations (
  id uuid primary key,
  revenue_program_id uuid not null references revenue_programs(id),
  allocation_period_start timestamptz not null,
  allocation_period_end timestamptz not null,
  total_amount_jpyc numeric(30, 0) not null,
  allocation_tx_hash text,
  created_at timestamptz not null default now()
);
```

### 12.4 revenue_claims
```sql
create table revenue_claims (
  id uuid primary key,
  revenue_right_id uuid not null references revenue_rights(id),
  revenue_allocation_id uuid not null references revenue_allocations(id),
  claimed_amount_jpyc numeric(30, 0) not null,
  claim_tx_hash text,
  claimed_at timestamptz not null default now()
);
```

---

## 13. Settlement & Ledger

### 13.1 wallets
```sql
create table wallets (
  id uuid primary key,
  user_id uuid references users(id),
  merchant_id uuid references merchants(id),
  wallet_address text unique not null,
  wallet_type text not null, -- USER / MERCHANT / TREASURY / PLATFORM
  created_at timestamptz not null default now()
);
```

### 13.2 ledger_entries
```sql
create table ledger_entries (
  id uuid primary key,
  entry_type text not null, -- PAYMENT / REFUND / DEPOSIT_HOLD / DEPOSIT_RELEASE / REVENUE_DISTRIBUTION / CLAIM
  reference_type text not null, -- USAGE / SESSION / COMPUTE / REVENUE
  reference_id uuid,
  from_wallet text,
  to_wallet text,
  amount_jpyc numeric(30, 0) not null,
  tx_hash text,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index idx_ledger_reference on ledger_entries(reference_type, reference_id);
create index idx_ledger_tx_hash on ledger_entries(tx_hash);
```

### 13.3 settlements
```sql
create table settlements (
  id uuid primary key,
  venue_id uuid references venues(id),
  settlement_type text not null, -- USAGE / COMPUTE / REVENUE / MIXED
  period_start timestamptz,
  period_end timestamptz,
  gross_amount_jpyc numeric(30, 0) not null,
  venue_share_jpyc numeric(30, 0) not null,
  platform_share_jpyc numeric(30, 0) not null,
  revenue_share_jpyc numeric(30, 0) not null,
  tx_hash text,
  status text not null default 'PENDING',
  created_at timestamptz not null default now()
);
```

---

## 14. Marketplace & Risk

### 14.1 marketplace_listings
統合リストテーブル、使用量/コンピューティング/収益をサポート

```sql
create table marketplace_listings (
  id uuid primary key,
  listing_type text not null, -- USAGE / COMPUTE / REVENUE
  asset_id uuid not null,
  seller_user_id uuid references users(id),
  price_jpyc numeric(30, 0) not null,
  expiry_at timestamptz,
  active boolean not null default true,
  buyer_user_id uuid references users(id),
  sold_at timestamptz,
  created_at timestamptz not null default now()
);
```

### 14.2 risk_flags
```sql
create table risk_flags (
  id uuid primary key,
  target_type text not null, -- USER / MACHINE / USAGE_RIGHT / COMPUTE_RIGHT / REVENUE_RIGHT / SESSION
  target_id uuid not null,
  risk_code text not null,
  severity text not null, -- LOW / MEDIUM / HIGH / CRITICAL
  status text not null default 'OPEN',
  notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
```

### 14.3 disputes
```sql
create table disputes (
  id uuid primary key,
  reference_type text not null,
  reference_id uuid not null,
  opener_user_id uuid references users(id),
  evidence_hash text,
  status text not null default 'OPEN', -- OPEN / UNDER_REVIEW / RESOLVED / REJECTED
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
```

---

## 15. 監査と操作のログ

### 15.1 audit_logs
```sql
create table audit_logs (
  id uuid primary key,
  actor_type text not null, -- USER / MERCHANT / ADMIN / SYSTEM
  actor_id uuid,
  action text not null,
  target_type text,
  target_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_logs_target on audit_logs(target_type, target_id);
```

---

## 16. 主要な実装に関する推奨事項

### 16.1 べき等
すべてのオンチェーン受信同期は冪等処理をサポートする必要があります。
- tx_hash の一意の検証
- コールバックリプレイ保護
- ledger_entries を繰り返し入力することはできません

### 16.2 二重販売保護
合格する必要があります:
- machine_slots 一意性制約
- 使用/計算生成前のスロット競合チェック
- スケジューラ+DB二層検証

### 16.3 ステータスの同期
オンチェーンのステータスとデータベースのステータスは、イベント インデクサー/キューを使用して調整する必要があり、フロントエンドは直接成功を想定することはできません。

---

## 17. まとめ

PRD v2 の目標は次のとおりです。

> **NodeStay をコンセプト プロジェクトから実装可能なシステムに昇格させます。 **

データベース構造は次の 3 つの役割を果たします。
1. マシン資産のルート管理
2. 使用量MVPの実装
3. コンピューティング/収益のスケーラブルな予約

このスキーマは、後続の Prisma/Drizzle/SQLAlchemy のデザイン マスターとして直接使用できます。
