# NodeStay / MachineFi プロトコルアーキテクチャおよびシステム設計書
バージョン：v1.0 Draft  
チェーン：Polygon  
決済資産：JPYC

## 1. ドキュメントの目的
本ドキュメントは、NodeStayのシステムアーキテクチャ、オンチェーンとオフチェーンの境界、モジュールの責務、ステートマシン、および連携関係を定義する。

## 2. 全体アーキテクチャ
NodeStayは **Hybrid Architecture（ハイブリッド・アーキテクチャ）** を採用する：

> **Execution Off-chain, Ownership & Settlement On-chain**
> （実行はオフチェーン、所有権と決済はオンチェーン）

具体的には：
- 資産、所有権、決済、収益分配：オンチェーン  
- スケジューリング、監視、タスク実行、リアルタイムセッション：オフチェーン  

システムは以下の4層（レイヤー）で構成される：

```text
User Layer（ユーザー層）
Application Layer（アプリケーション層）
Machine Network Layer（機器ネットワーク層）
Blockchain & Settlement Layer（ブロックチェーン・決済層）
```

## 3. 4層アーキテクチャの説明
### 3.1 User Layer
対象：運営者（Merchant）、利用者（User）、計算資源の買い手（Compute Buyer）、投資家（Investor）、トレーダー（Trader）。

### 3.2 Application Layer
含まれるもの：
- 店舗管理システム
- 機器登録コンソール
- Usage市場（施設利用）
- Compute市場（計算資源利用）
- Revenue市場（収益）
- 注文システム
- リスク管理システム
- 決済ダッシュボード

### 3.3 Machine Network Layer
含まれるもの：
- ネットカフェPC
- ローカル端末
- 監視エージェント（Agent）
- スケジューラ（Scheduler）
- check-in / check-out ゲートウェイ

### 3.4 Blockchain & Settlement Layer
Polygon上にデプロイされるもの：
- MachineRegistry（機器登録）
- UsageRight Contract（施設利用権コントラクト）
- ComputeRight Contract（計算資源利用権コントラクト）
- RevenueRight Contract（収益権コントラクト）
- Settlement Contract（決済コントラクト）
- Marketplace Contract（マーケットプレイス・コントラクト：オプション）

## 4. 資産の階層構造
**Asset Root + Rights Layer** モデルを採用する。

```text
Machine Root（機器ルート）
├─ Usage Rights（施設利用権）
├─ Compute Rights（計算資源利用権）
└─ Revenue Rights（収益権）
```

## 5. On-chain / Off-chain の区分
### 5.1 オンチェーン必須
- Machine Root の登録
- Usage / Compute / Revenue の3つの権利
- JPYC による支払い、エスクロー、収益分配
- 収益分配の結果記録

### 5.2 オフチェーン必須
- 実際の計算資源の実行（GPUタスク等）
- リアルタイム・スケジューラ
- セッション制御
- 動的価格設定の計算

### 5.3 Hash Anchoring（ハッシュ・アンカリング）
オフチェーン保存 ＋ オンチェーンへのハッシュ値記録を推奨：
- 機器ハードウェアの詳細仕様
- 領収書 / 請求書
- KYC結果の証明
- セッションログ
- タスク結果のサマリー
- 紛争（dispute）のエビデンス資料

## 6. 3つの市場の連携方法
### 6.1 Usage Market
取引対象：Usage Right  
消費方法：店舗での実地利用  
制約：同一時間枠の Compute Right と衝突してはならない

### 6.2 Compute Market
取引対象：Compute Right  
利用方法：オフチェーン・スケジューラによるタスク実行  
制約：リアルユーザーの利用（Usage）を優先しなければならない

### 6.3 Revenue Market
取引対象：Revenue Right  
役割：将来の Usage ＋ Compute から生じる収益フローを分配する

## 7. 優先順位ルール
```text
Physical User Usage（リアルユーザー利用） > Compute Task（計算タスク） > Secondary Financial Activity（二次的な金融活動）
```

## 8. ステートマシン
### 8.1 Machine Root
REGISTERED（登録済み） → ACTIVE（有効） → PAUSED（一時停止） / MAINTENANCE（メンテナンス中） → DECOMMISSIONED（廃棄済み）

### 8.2 Usage Right
MINTED（発行済み） → LISTED（出品中） → LOCKED（ロック済み） → CHECKED_IN（チェックイン済み） → CONSUMED（消費済み） / EXPIRED（期限切れ） / CANCELLED（キャンセル済み）

### 8.3 Compute Right
ISSUED（発行済み） → LISTED（出品中） → RESERVED（予約済み） → RUNNING（実行中） → COMPLETED（完了） / INTERRUPTED（中断） / FAILED（失敗） / EXPIRED（期限切れ）

### 8.4 Revenue Right
ISSUED（発行済み） → ACTIVE（有効） → PAUSED（一時停止） → EXPIRED（期限切れ） / REDEEMED（償還済み）

## 9. リスク管理と衝突制御
### 9.1 二重販売（ダブルセリング）の防止
同一機器、同一時間枠において：
- 衝突する UsageRight を重複して mint することはできない
- 衝突する ComputeRight を重複して mint することはできない
- Usage と Compute はスロット・ビットマップ（slot bitmap）または占有記録（occupancy record）により検証される

### 9.2 収益権の上限
単体機器の総収益権の販売比率は、40%を超えないことを推奨する。

### 9.3 KYC ゲート（KYC Gate）
高額な収益権、長期の利用権、特定の会場における実名が必要なシーンでは、オフチェーンでの KYC 検証を推奨する。

### 9.4 一時停止（Pause）権限
故障、紛争、法的リスク、異常データの発生時には、Machine Root またはその下流の権利を凍結（Pause）できる。

## 10. 決済アーキテクチャ
Settlement Contract の役割：
- Usage payment（利用料支払い）
- Compute payment（計算資源利用料支払い）
- Deposit hold / release / capture（デポジット管理）
- Revenue allocation（収益分配）
- Platform fee routing（プラットフォーム手数料のルーティング）
- Claim logic（請求ロジック）

## 11. モジュール責務マトリックス
| モジュール | オンチェーン/オフチェーン | 主な責務 |
|---|---|---|
| MachineRegistry | オンチェーン | 機器 root の登録 |
| UsageRight | オンチェーン | 施設利用権の mint / transfer / consume |
| ComputeRight | オンチェーン | 計算資源予約権の mint / reserve / settle |
| RevenueRight | オンチェーン | 収益権の発行および claim |
| Settlement | オンチェーン | JPYC のエスクローおよび分配 |
| Marketplace | ハイブリッド | 出品（Listing）と成約 |
| Scheduler | オフチェーン | 機器のスケジューリングと衝突制御 |
| Agent | オフチェーン | ステータスの収集とタスクの実行 |
| Check-in Service | オフチェーン | 来店利用の制御 |
| Risk Engine | オフチェーン | ルール判定と凍結処理 |

## 12. 設計の結論
NodeStayは、信頼（Trust）、権利確定（確権）、決済（Settlement）が必要な部分のみをオンチェーン化することで、Web3の信頼できるアセットレイヤーと現実世界のシステムの効率性を両立させる。
