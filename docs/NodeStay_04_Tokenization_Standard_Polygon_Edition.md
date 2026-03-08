# NodeStay / MachineFi トークン化標準
## Polygon 版
バージョン：v1.0 Draft

## 1. ドキュメントの目的
Polygon上におけるNodeStayの資産トークン化標準を定義する：
- 機器のルートアセット（根資産）をどう表現するか
- 3種類の権利をオンチェーンでどうモデリングするか
- どの権利が譲渡可能で、どの権利が譲渡不可か
- どの情報をオンチェーン（on-chain）にし、どの情報をオフチェーン（off-chain）にするか
- JPYC 決済レイヤーとどのように連携するか

## 2. 設計思想
以下のモデルを採用する：

> **Asset Root + Rights Layer**
> （資産ルート ＋ 権利レイヤー）

```text
Machine Root Asset（機器ルート資産）
├─ Usage Right（施設利用権）
├─ Compute Right（計算資源利用権）
└─ Revenue Right（収益権）
```

原則：
1. 機器は親アセット（母資産）である  
2. 権利は派生アセット（派生資産）である  
3. 権利は独立して取引可能である  
4. 決済と実行を分離する  
5. すべての派生権利は Machine Root まで遡ることができる  

## 3. Machine Root Asset（機器ルート資産）
### 3.1 定義
現実に存在し、登録済みの1台の機器を表す。

### 3.2 machineId 生成の推奨
```text
machineId = keccak256(
  venueId,
  localMachineSerial,
  hardwareFingerprintHash,
  registrationNonce
)
```

### 3.3 オンチェーンフィールド
- machineId
- venueIdHash
- ownerAddress
- machineClass
- status
- specHash
- metadataURI

### 3.4 推奨標準
**ERC-721**

## 4. Usage Right Standard（施設利用権標準）
### 4.1 定義
特定の機器または機器プールの特定の時間枠における物理的な利用権を表す。

### 4.2 オンチェーンフィールド
- usageRightId
- machineId / machinePoolId
- startAt
- endAt
- usageType
- transferPolicy
- kycLevelRequired
- status
- metadataURI

### 4.3 推奨標準
MVP 推奨：**ERC-721**

### 4.4 譲渡ルール
#### デフォルトで譲渡可能
- 単発の時間パック
- 夜間パック
- 指定時間枠パック

#### デフォルトで譲渡不可
- 月間サブスクリプション
- 利用開始後
- 譲渡締め切り（cutoff）時間を過ぎたもの
- 強固な本人確認（実名）紐付けが必要な権益

### 4.5 推奨パラメータ
- transferable（譲渡可能フラグ）: bool
- cooldownPeriod（クールダウン期間）: 24h
- transferCutoff（譲渡締め切り）: 開始1時間前
- maxTransferCount（最大譲渡回数）: 1〜2回

### 4.6 ステートマシン
MINTED → LISTED → LOCKED → CHECKED_IN → CONSUMED / EXPIRED / CANCELLED

## 5. Compute Right Standard（計算資源利用権標準）
### 5.1 定義
特定の機器の特定の時間枠における計算資源の利用権を表す。

### 5.2 オンチェーンフィールド
- computeRightId
- machineId
- computeTier
- startWindow
- endWindow
- maxDuration
- preemptible
- settlementPolicy
- status
- metadataURI

### 5.3 推奨標準
**ERC-721**

### 5.4 譲渡ルール
#### 譲渡可能
- 未開始
- RUNNING ステータス移行前

#### 譲渡不可
- 実行開始後
- 特定のタスクにロックされ、二次譲渡が禁止されている場合

### 5.5 preemptible（中断可能性）フィールド
以下の定義が必須：
- リアルユーザーの入席による中断を許可するかどうか
- 中断された場合、決済をどのように比例配分するか

### 5.6 ステートマシン
ISSUED → LISTED → RESERVED → RUNNING → COMPLETED / INTERRUPTED / FAILED / EXPIRED

## 6. Revenue Right Standard（収益権標準）
### 6.1 定義
特定の機器の将来の収益の一部の分配を受ける権利を表す。

### 6.2 オンチェーンフィールド
- revenueRightId
- machineId
- shareBps
- revenueScope
- startAt
- endAt
- payoutToken
- settlementCycle
- status
- metadataURI

### 6.3 推奨標準
**ERC-1155**

### 6.4 譲渡ルール
#### デフォルトで譲渡可能
- 二次市場をサポート
- 持分（シェア）の分散保持をサポート

#### オプションの制限
- ロックアップ期間（lock-up period）
- ホワイトリスト制市場（whitelist market）
- 1台あたりの機器における収益権販売比率の上限

### 6.5 推奨制限
```text
totalRevenueSoldPerMachine <= 40%
```

### 6.6 ステートマシン
ISSUED → ACTIVE → PAUSED → EXPIRED / REDEEMED

## 7. Transferability Matrix（譲渡可能性マトリックス）
| 権利タイプ | デフォルトでの譲渡可否 | 譲渡不可のタイミング | 推奨標準 | オンチェーン |
|---|---|---|---|---|
| Machine Root | 否 | 運営期間中は原則流通させない | ERC-721 | 是 |
| Usage Right（単発パック） | 是 | 利用開始後 / 開始直前 / KYC紐付け時 | ERC-721 | 是 |
| Usage Right（月間サブスク） | 否 | 全期間譲渡不可 | オプション | 是 |
| Compute Right | 是 | 実行中（running） / ロック済みかつ譲渡禁止時 | ERC-721 | 是 |
| Revenue Right | 是 | ロックアップ / ホワイトリスト制限時のみ | ERC-1155 | 是 |
| Session Data | 該当なし | - | - | 否 |
| Compute Logs | 該当なし | - | - | 否 |
| KYC 明文明細 | 該当なし | - | - | 否 |
| Receipt / Evidence Hash | 該当なし | - | hash anchor | 一部 |

## 8. On-chain / Off-chain Boundary（境界線）
### オンチェーン（On-chain）必須
- Machine Root の所有権（ownership）
- Usage / Compute / Revenue の各権利
- JPYC のエスクローおよび利益分配
- 収益分配の結果記録

### オフチェーン（Off-chain）必須
- 機器の監視（モニタリング）
- タスクの実行
- check-in/check-out の詳細
- スケジューラ（scheduler）
- 大容量のログデータ
- 価格エンジンのリアルタイム演算

### Hash Anchor 推奨対象
- KYC proof hash
- session log hash
- compute result hash
- dispute evidence hash
- spec detail hash

## 9. コントラクト提案
### Core Contracts（コア・コントラクト）
- NodeStayMachineRegistry
- NodeStayUsageRight
- NodeStayComputeRight
- NodeStayRevenueRight
- NodeStaySettlement

### Optional Contracts（オプション・コントラクト）
- NodeStayMarketplace
- NodeStayOracleAdapter
- NodeStayDisputeResolver
- NodeStayKYCGate

## 10. JPYC による決済（Settlement）
### Usage（施設利用）
ユーザーが JPYC を支払う → SettlementContract  
その後、以下に分配：
- venue（会場）
- platform（プラットフォーム）
- revenue right holder（収益権保持者：該当する場合）

### Compute（計算資源利用）
計算資源の買い手が JPYC を支払う → SettlementContract  
その後、以下に分配：
- venue（会場）
- platform（プラットフォーム）
- revenue right holder（収益権保持者：該当する場合）

### Revenue（収益）
推奨：
- オフチェーンで収入を集計
- 周期的にオンチェーンで allocate（割り当て）を実行
- 保持者が主体的に claim（請求）を行う

## 11. メタデータ Schema 提案
### Machine Metadata
```json
{
  "machineId": "string",
  "venueName": "string",
  "location": {"country": "JP", "prefecture": "Tokyo", "city": "Shibuya"},
  "hardware": {"cpu": "i7-12700", "gpu": "RTX3060", "ramGb": 16, "storageGb": 512},
  "machineClass": "GPU",
  "status": "ACTIVE"
}
```

### Usage Metadata
```json
{
  "rightType": "USAGE",
  "machineId": "string",
  "startAt": 1770000000,
  "endAt": 1770020000,
  "usageType": "NIGHT_PACK",
  "transferable": true,
  "kycRequired": true
}
```

### Compute Metadata
```json
{
  "rightType": "COMPUTE",
  "machineId": "string",
  "computeTier": "RTX3060",
  "startWindow": 1770000000,
  "endWindow": 1770020000,
  "preemptible": true,
  "maxDurationMinutes": 180
}
```

### Revenue Metadata
```json
{
  "rightType": "REVENUE",
  "machineId": "string",
  "shareBps": 2000,
  "revenueScope": "ALL",
  "startAt": 1770000000,
  "endAt": 1801536000,
  "settlementCycle": "WEEKLY",
  "payoutToken": "JPYC"
}
```

## 12. MVP への提案
### 先に実装するもの
- Machine Root
- UsageRight
- JPYC Settlement
- シンプルな Marketplace

### 後回しにするもの
- ComputeRight
- RevenueRight

## 13. 結論
NodeStayのトークン化標準は一般的なNFTスキームではなく、以下である：

> **現実世界の機器資産における Polygon 上の多層的な経済的権利の標準。**
