# NodeStay PRD v3 Full Spec
バージョン：v3.0 Draft  
ステータス：詳細実行版 PRD  
ベース：MachineFi 3市場モデル（Revenue / Compute / Usage）  
チェーン：Polygon  
決済資産：JPYC

---

# 0. ドキュメント説明

本ドキュメントは、NodeStayの**詳細実行版PRD**である。その目的は、新しいMachineFiの方向性を旧版PRDと同等の実装粒度まで補完することにある。  
これはホワイトペーパーやピッチ資料ではなく、以下のためのものである：

> **プロダクト、デザイン、フロントエンド・バックエンド、コントラクト、リスク管理、運営が共通で使用する開発マスターデータ**

本ドキュメントの目的は、以下の問いに答えることである：

1. プロダクトは現在、具体的に何をするのか  
2. どの機能がMVPで必須であり、どれが予約済み（将来用）か  
3. ページ、エンティティ、ステータス、権限をどう定義するか  
4. オンチェーンとオフチェーンをどう連携させるか  
5. APIとDBで何をサポートする必要があるか  
6. 返金、キャンセル、中断、失敗、紛争をどう処理するか  

---

# 1. 製品定義

## 1.1 一言でいうと

NodeStayは、ネットカフェの機器資産を以下の3つのプログラム可能な経済的権利に分解する：

1. Revenue Right（収益権）  
2. Compute Right（計算資源利用権）  
3. Usage Right（施設利用権）  

そして、ユーザーがこれらの権利を購入、使用、譲渡、投資、および収益受領を行うことを可能にする。

## 1.2 製品の本質

NodeStayは単なるネットカフェ向けソフトウェアでも、「ネットカフェにNFTを追加する」プロジェクトでもない。  
その本質は：

> **現実世界の機器資産市場（Machine Asset Market）**

## 1.3 第一段階のポジショニング

第一段階では「日本のネットカフェ」シーンに特化して展開する。その理由は以下の通り：

- 機器が既に存在している
- タイムスライス（時間貸し）モデルが天然の形で存在している
- 物理的な使用と計算資源の供給という二重の属性が成立している
- シーンが明確であり、資産化ロジックの検証が容易である

## 1.4 長期的なポジショニング

長期的には以下のように拡張する：

> **MachineFi：現実世界の機器資産に向けた金融層および市場層プロトコル**

---

# 2. 製品目標

## 2.1 ビジネス目標

1. ネットカフェ経営者が機器を単一収入資産から多重収入資産へとアップグレードするのを支援する  
2. ユーザーが譲渡可能で検証可能な機器利用権を獲得するのを支援する  
3. 计算资源的買い手が、現実世界のアイドル状態にある機器の計算時間を購入するのを支援する  
4. 投資家が個別の機器収益に参加するのを支援する  
5. プラットフォームとして Usage / Compute / Revenue の3市場ネットワークを形成する

## 2.2 MVP目標

MVP段階では、以下の5点を証明することのみを要求する：

1. 機器資産をオンチェーンで登録できること  
2. UsageRightが正常にmint、購入、譲渡できること  
3. JPYCによって実際のオンチェーン決済と記録が完了すること  
4. check-in / check-out のオフチェーンクローズドループが利用可能であること  
5. オンチェーンとオフチェーンのステータスが同期可能であること

## 2.3 非目標（現バージョンでは追求しないこと）

1. 完全なGPUクラウドプラットフォーム機能  
2. 複雑かつ高頻度なマッチング取引システム  
3. 大規模な機関投資家向け市場  
4. 完全自動化された収益権評価システム  
5. 全カテゴリーの機器資産サポート  

---

# 3. ユーザーロール

## 3.1 Consumer User（一般利用者）
役割：
- 会場、機器、時間枠の閲覧
- UsageRightの購入
- 店舗での check-in
- 使用後の check-out
- 譲渡可能なUsageRightの転売

## 3.2 Compute Buyer（計算資源の買い手）
役割：
- 利用可能なComputeRightの閲覧
- 計算時間枠の購入
- タスクの送信
- 実行結果と決済状況の確認

## 3.3 Investor（投資家）
役割：
- RevenueRightの閲覧
- 収益権の購入
- 機器の収益分配の確認
- 配当の受領
- 二次市場での譲渡

## 3.4 Merchant / Venue Owner（ネットカフェ経営者）
役割：
- 会場の登録
- 機器の登録
- Usage商品の設定
- Compute商品の出品
- Revenue Programの発行
- 決済、収益、稼働率の確認

## 3.5 Admin（プラットフォーム管理者）
役割：
- 加盟店の審査
- KYC / リスク管理 / 紛争（dispute）の処理
- 異常な注文の処理とオンチェーン照合
- 資産またはユーザーの凍結

## 3.6 Risk / Compliance Operator（リスク・コンプライアンス担当）
役割：
- 高リスク取引の審査
- 収益権の販売比率制限の管理
- 異常な Machine / Right / User の凍結
- AML / KYC ルールの実行監視

---

# 4. コアアセットモデル

## 4.1 Machine Root（親資産）
現実に存在し、登録済みの1台の機器を表す。

### コア属性
- machineId
- venueId
- owner
- machineClass
- hardware spec
- status
- metadataURI
- on-chain tokenId

### ステータス
- REGISTERED（登録済み）
- ACTIVE（有効）
- PAUSED（一時停止）
- MAINTENANCE（メンテナンス中）
- DECOMMISSIONED（廃棄済み）

### 説明
Machine Rootはすべての下流の権利のアンカーであり、一般ユーザー向けの取引には直接供されない。

---

## 4.2 Usage Right（施設利用権）
特定の時間枠内における、機器または機器プールの物理的な利用権を表す。

### コア属性
- usageRightId
- machineId / machinePoolId
- startAt
- endAt
- usageType
- transferable
- transferCutoff
- maxTransferCount
- kycLevelRequired
- status

### ステータス
- MINTED（発行済み）
- LISTED（出品中）
- LOCKED（ロック済み）
- CHECKED_IN（チェックイン済み）
- CONSUMED（消費済み）
- EXPIRED（期限切れ）
- CANCELLED（キャンセル済み）

---

## 4.3 Compute Right（計算資源利用権）
特定の時間枠内における、機器の計算資源の利用権を表す。

### コア属性
- computeRightId
- machineId
- computeTier
- startWindow
- endWindow
- maxDurationMinutes
- preemptible
- settlementPolicy
- status

### ステータス
- ISSUED（発行済み）
- LISTED（出品中）
- RESERVED（予約済み）
- RUNNING（実行中）
- COMPLETED（完了）
- INTERRUPTED（中断）
- FAILED（失敗）
- EXPIRED（期限切れ）

---

## 4.4 Revenue Right（収益権）
特定の機器の将来の収益の一部の分配を受ける権利を表す。

### コア属性
- revenueRightId
- machineId
- shareBps
- revenueScope
- startAt
- endAt
- payoutToken
- settlementCycle
- status

### ステータス
- ISSUED（発行済み）
- ACTIVE（有効）
- PAUSED（一時停止）
- EXPIRED（期限切れ）
- REDEEMED（償還済み）

---

# 5. 譲渡可能性マトリックス

| 権利タイプ | デフォルトでの譲渡可否 | 譲渡不可の条件 | 説明 |
|---|---|---|---|
| Machine Root | 否 | デフォルトで流通開放せず | 運営資産であり、外部市場には出さない |
| UsageRight（単発パック） | 是 | 使用開始後、カットオフ超過後、KYC紐付け時 | 二次流通をサポート |
| UsageRight（月間サブスク） | 否 | 全期間譲渡不可 | 長期的な権益とIDを紐付ける |
| ComputeRight | 是 | 実行中（running）、タスク紐付け後の譲渡禁止設定時 | 予約型リソースとして流通可能 |
| RevenueRight | 是 | lock-up / whitelist の制約に従う | 投資型アセット |
| Session Data | 否 | 該当なし | 純粋なオフチェーン記録 |
| Compute Logs | 否 | 該当なし | オフチェーン記録 |
| KYC 明文明細 | 否 | 該当なし | オフチェーン保存のみ |
| Receipt / Evidence Hash | 該当なし | - | オンチェーンにハッシュのみアンカー |

---

# 6. On-chain / Off-chain 境界

## 6.1 オンチェーン必須
- Machine Root の登録
- UsageRight / ComputeRight / RevenueRight の mint および transfer
- JPYC による支払い
- deposit の hold / capture / release
- 収益分配の記録
- 市場取引の最終ステータス

## 6.2 オフチェーン必須
- 機器のオンラインステータス
- scheduler（スケジューラ）
- check-in / check-out プロセスの詳細
- GPU / CPU の実際のタスク実行
- KYCの明文および証明資料
- 紛争（dispute）の添付書類原本
- 動的価格設定のリアルタイム計算

## 6.3 オフチェーン保存 + オンチェーンハッシュ
- machine spec detail hash
- KYC proof hash
- session log hash
- compute result hash
- receipt hash
- dispute evidence hash

---

# 7. 優先順位ルール

## 7.1 絶対優先順位
```text
Physical User Usage > Compute Task > Secondary Financial Activity
```

## 7.2 解釈
1. リアルユーザーの来店利用が最優先である  
2. Computeタスクは物理的な利用を妨げてはならない  
3. RevenueRightは収益分配にのみ関与し、スケジューリングには関与しない  
4. 金融層の取引が実体の運営を破壊してはならない

---

# 8. ページレベルの機能定義

---

## 8.1 Consumer（利用者）側

### 8.1.1 トップページ / Discover
目的：
- ユーザーがUsageRightを購入可能な会場と時間枠を発見できるようにする

表示内容：
- おすすめの会場
- 周辺の会場
- 人気の時間パック
- 価格トレンドタグ
- ログインステータス
- ウォレット接続ステータス

操作：
- 会場の検索
- 時間 / 地域 / 機器グレードによるフィルタリング
- Venue Detail（会場詳細）へ移動
- My Assets（マイアセット）へ移動

異常系ステータス：
- ウォレット未接続
- 利用可能な商品なし
- 位置情報の取得失敗
- オンチェーン価格の同期失敗

---

### 8.1.2 Venue Detail（会場詳細）
目的：
- 単一の会場で販売されているUsage商品を表示する

表示内容：
- 会場情報
- 機器タイプ
- Usage製品リスト
- KYCの要否
- 現在の価格
- 譲渡可能フラグ

操作：
- Usage商品の確認
- UsageRightの購入
- 会場のお気に入り登録（オプション）

---

### 8.1.3 UsageRight Detail（UsageRight詳細）
目的：
- 特定の時間権益に関するすべての情報を表示する

表示内容：
- 対応する会場
- 対応する機器 / 機器プール
- 開始時間 / 終了時間
- 利用ルール
- 譲渡ルール
- KYC要件
- 現在の所有者
- 取引履歴（オプション）

操作：
- 購入
- オンチェーン記録の確認
- 自身が保持している場合は譲渡の開始

---

### 8.1.4 My Assets（マイアセット）
目的：
- ユーザーが自身の保持する3つのアセットクラスを確認できるようにする

タブ分け：
- Usage
- Compute
- Revenue

フィールド：
- アセット名
- ステータス
- 有効期限
- 譲渡可否
- 累積収益（Revenue）
- 現在のリスティング（出品）状況

操作：
- 詳細表示
- 譲渡 / 出品
- check-in（Usage）
- claim（Revenue）

---

### 8.1.5 Orders（注文履歴）
目的：
- 購入および成約記録を表示する

タイプ：
- 購入注文
- 販売注文
- 収益受領
- Refund / cancel

フィールド：
- 注文番号
- アセットタイプ
- 価格
- ステータス
- txHash
- 日時

---

### 8.1.6 Sessions（セッション履歴）
目的：
- 来店利用記録を表示する

フィールド：
- usageRightId
- 会場
- 機器
- check-in 日時
- check-out 日時
- ステータス
- エビデンスハッシュ（該当する場合）

---

### 8.1.7 Balance / Settlement History（残高・決済履歴）
目的：
- JPYC関連の記録を表示する

フィールド：
- 利用可能残高
- デポジット凍結中
- 最近の支払い
- 最近の返金
- 最近の収益受領

---

## 8.2 Merchant（加盟店）側

### 8.2.1 Merchant Dashboard（加盟店ダッシュボード）
目的：
- 運営状況を俯瞰する

表示内容：
- 会場数
- 機器数
- 本日のUsage収入
- 本日のCompute収入（予約済み）
- 今週の決済額
- 機器稼働率

---

### 8.2.2 Venue Management（会場管理）
目的：
- 会場の設定と管理

操作：
- 会場の新規作成
- 会場情報の編集
- KYC要件の設定
- 営業時間の設定
- デフォルトポリシーの設定

---

### 8.2.3 Machine Management（機器管理）
目的：
- 機器の親資産の管理

操作：
- 機器の新規追加
- ハードウェア仕様の編集
- オンチェーン登録の送信
- オンチェーンステータスの確認
- machine statusの変更
- 機器に対応する3つの権利の発行状況の確認

表示フィールド：
- machineId
- machineClass
- CPU / GPU / RAM
- status
- on-chain tokenId
- 現在のスロット占有状況

---

### 8.2.4 Usage Product Management（Usage製品管理）
目的：
- 時間枠商品の設定

操作：
- 製品の新規作成
- 機器 / 機器プールの選択
- usageTypeの設定
- 開始日時 / 期間の設定
- 価格の設定
- 譲渡可能性の設定
- KYCレベルの設定
- 公開 / 公開停止
- UsageRightの一括mint

---

### 8.2.5 Compute Product Management（Compute製品管理：予約済み）
目的：
- 計算資源時間枠商品の設定

操作：
- 機器の設定
- computeTierの設定
- 時間枠の設定
- preemptible（中断可能性）の設定
- 価格の設定
- 公開 / 公開停止

---

### 8.2.6 Revenue Program Management（収益プログラム管理：予約済み）
目的：
- 収益権計画の発行

操作：
- 機器の選択
- shareBps（分配率）の設定
- revenueScope（収益範囲）の設定
- 開始 / 終了日時の設定
- settlementCycle（決済サイクル）の設定
- リスク管理審査への提出
- RevenueRightの発行

---

### 8.2.7 Settlement Dashboard（決済ダッシュボード）
目的：
- 運営の決済状況を確認する

表示内容：
- Usage収入
- Compute収入
- プラットフォーム手数料
- Revenue holder（収益権保持者）への分配
- 純利益（手取り額）
- txHash
- 週次/月次トレンド

---

## 8.3 Admin（管理）側

### 8.3.1 User Management（ユーザー管理）
- ユーザーの閲覧
- KYCレベルの変更
- ユーザーの凍結
- リスクメモの記載

### 8.3.2 Merchant Review（加盟店審査）
- 加盟店の審査
- 会場の審査
- 機器情報の審査
- 収益権発行申請の審査

### 8.3.3 Risk Center（リスクセンター）
- リスクフラグの確認
- 資産 / ユーザー / 会場の凍結
- 高リスク取引の審査
- 異常な譲渡の処理

### 8.3.4 Dispute Center（紛争センター）
- 紛争（dispute）の確認
- エビデンスハッシュに対応する添付ファイルのダウンロード
- 処理の結論付け
- resolution（解決策）の書き込み

### 8.3.5 Chain Ops（オンチェーン運用）
- オンチェーン取引の失敗確認
- リトライ待ちイベントの確認
- 照合ジョブの実行
- event indexer（イベントインデクサ）のステータス確認

---

# 9. エンティティおよびフィールド定義

---

## 9.1 User（ユーザー）
フィールド：
- id
- walletAddress
- email
- phone
- displayName
- kycLevel
- kycProofHash
- status
- createdAt
- updatedAt

ルール：
- walletAddress はユニーク
- kycLevel のデフォルトは 0
- 凍結ユーザーは購入および譲渡を開始できない

---

## 9.2 Merchant（加盟店）
フィールド：
- id
- name
- ownerUserId
- treasuryWallet
- status
- createdAt
- updatedAt

ルール：
- ACTIVEなmerchantのみが会場と機器を作成できる
- treasuryWallet は決済の分配に使用される

---

## 9.3 Venue（会場）
フィールド：
- id
- merchantId
- name
- country
- prefecture
- city
- address
- timezone
- venueIdHash
- requiresKyc
- status

---

## 9.4 Machine（機器）
フィールド：
- id
- venueId
- machineId
- localSerial
- hardwareFingerprintHash
- ownerWallet
- machineClass
- cpu
- gpu
- ramGb
- storageGb
- specHash
- metadataUri
- onchainTokenId
- onchainTxHash
- status

ルール：
- machineId はグローバルでユニーク
- 機器が DECOMMISSIONED ステータスの場合、新しい権利の発行は許可されない

---

## 9.5 UsageProduct（Usage製品）
フィールド：
- id
- venueId
- machineId
- productName
- usageType
- startAt
- endAt
- durationMinutes
- transferable
- transferCutoffMinutes
- maxTransferCount
- kycLevelRequired
- priceJpyc
- metadataUri
- status

---

## 9.6 UsageRight（Usage利用権）
フィールド：
- id
- usageProductId
- machineId
- ownerUserId
- onchainTokenId
- onchainTxHash
- startAt
- endAt
- transferable
- transferCutoffAt
- transferCount
- maxTransferCount
- kycLevelRequired
- status
- metadataUri

ルール：
- 1つのUsageRightは1つのオンチェーントークンに対応する
- status の変化はオンチェーンイベントまたはオフチェーンセッションと連動しなければならない
- CHECKED_IN 状態のものは譲渡不可

---

## 9.7 Session（セッション）
フィールド：
- id
- usageRightId
- userId
- venueId
- machineId
- checkedInAt
- checkedOutAt
- status
- checkinMethod
- evidenceHash
- notes

ルール：
- 1つのUsageRightは最大で1つの有効なセッションに対応する
- check-in 時には以下の検証が必要：
  - アセットが有効であること
  - 期限切れでないこと
  - KYCレベルを満たしていること
  - 会場のステータスが許可されていること

---

## 9.8 ComputeProduct / ComputeRight / ComputeJob（計算資源：予約済み）
サポートが必要な内容：
- 機器
- 時間枠
- 計算資源グレード
- 中断可能性
- job実行結果のハッシュ
- interruption reason（中断理由）

---

## 9.9 RevenueProgram / RevenueRight / RevenueAllocation（収益：予約済み）
サポートが必要な内容：
- 単体機器の収益権比率
- settlementCycle（決済サイクル）
- payout token（支払いトークン）
- allocation period（分配期間）
- claim record（請求記録）

---

## 9.10 LedgerEntry（元帳エントリ）
フィールド：
- id
- entryType
- referenceType
- referenceId
- fromWallet
- toWallet
- amountJpyc
- txHash
- status
- createdAt
- confirmedAt

ルール：
- txHash による重複排除
- replay callback による重複入帳の禁止
- 同一リファレンスの決済はべき等（idempotent）である必要がある

---

# 10. ステートマシン詳細

---

## 10.1 UsageRight ステータス遷移

### MINTED → LISTED
トリガー：
- merchant / platform

条件：
- 権利のオンチェーン登録が成功していること
- 時間枠が開始されていないこと
- 会場と機器が販売可能状態であること

### LISTED → LOCKED
トリガー：
- ユーザーの注文が成功したが、最終消費前である

条件：
- 支払いが成功していること
- 所有権が移転されたか、注文がロックされたこと

### LOCKED → CHECKED_IN
トリガー：
- ユーザーによる来店 check-in

条件：
- 現在時刻が利用可能時間枠内であること
- KYCを満たしていること
- 機器が利用可能であること
- 競合するセッションがないこと

### CHECKED_IN → CONSUMED
トリガー：
- check-out の完了

条件：
- セッションが終了していること
- 決済（settlement）または記帳が成功していること

### 未消費の任意状態 → EXPIRED
トリガー：
- システムタスク

条件：
- 現在時刻 > endAt
- CHECKED_IN ステータスになっていないこと

### 未使用状態 → CANCELLED
トリガー：
- ユーザーキャンセル / merchantキャンセル / admin凍結

条件：
- キャンセルポリシーを満たしていること
- オンチェーンステータスが同期されているか、補填記録があること

---

## 10.2 ComputeRight ステータス遷移（予約済み）

ISSUED → LISTED → RESERVED → RUNNING → COMPLETED / INTERRUPTED / FAILED / EXPIRED

補足ルール：
- RUNNING 状態は譲渡不可
- INTERRUPTED の場合は中断理由（interruption reason）を記録する必要がある
- FAILED の場合は返金/部分返金ブランチに移行する必要がある

---

## 10.3 RevenueRight ステータス遷移（予約済み）

ISSUED → ACTIVE → PAUSED → EXPIRED / REDEEMED

---

# 11. 権限マトリックス

| 行為 | User | Merchant | Admin | Risk |
|---|---|---|---|---|
| Usage商品の閲覧 | 是 | 是 | 是 | 是 |
| UsageRightの購入 | 是 | 否 | 否 | 否 |
| 自身が保持するUsageRightの譲渡 | 是 | 否 | 否 | 否 |
| check-in / check-out | 是 | 補助 | 否 | 否 |
| Venueの作成 | 否 | 是 | 是 | 否 |
| Machineの新規追加 | 否 | 是 | 是 | 否 |
| UsageRightのMint | 否 | 是 | 是 | 否 |
| Revenue Programの発行 | 否 | 是 | 是 | 審査 |
| Userの凍結 | 否 | 否 | 是 | 是 |
| Machine / Rightの凍結 | 否 | 否 | 是 | 是 |
| disputeの処理 | 否 | 発起/回答 | 是 | 是 |
| settlementの手動修復 | 否 | 否 | 是 | 否 |

---

# 12. ユーザーフロー

---

## 12.1 Usage 購入フロー

1. ユーザーが Venue Detail に入る  
2. Usage商品を選択する  
3. プラットフォームによるバリデーション：
   - 商品ステータス
   - 時間枠の有効性
   - KYC要件
4. JPYC決済の開始  
5. オンチェーンで購入完了 / txHash の記録  
6. UsageRight がユーザーのアセットリストに追加される  
7. ステータスが LOCKED / 保有状態に更新される  

---

## 12.2 Usage 譲渡フロー

1. ユーザーが My Assets に入る  
2. 譲渡可能な UsageRight を選択する  
3. システムによるバリデーション：
   - transferable = true
   - 現在時刻 < transferCutoffAt
   - transferCount < maxTransferCount
   - ステータスが CHECKED_IN / CONSUMED / EXPIRED でないこと
4. ユーザーが出品価格を設定する  
5. リスティング（出品）の作成  
6. 第三者が購入した後：
   - オンチェーンで所有権を移転
   - transferCount + 1
   - リスティングステータスが SOLD に変わる

---

## 12.3 check-in フロー

1. ユーザーが来店する  
2. 店員 / kiosk / app が check-in を開始する  
3. システムによるバリデーション：
   - 現在のユーザーが所有者であること
   - ステータスが利用可能であること
   - 現在時刻が利用可能枠内であること
   - KYCレベルを満たしていること
   - 機器が占有されていないこと
4. Session の作成  
5. UsageRight のステータスを CHECKED_IN に変更  
6. machine slot の占有状況を RESERVED/IN_USE に変更

---

## 12.4 check-out フロー

1. ユーザーが check-out を開始する  
2. システムが checkedOutAt を記録  
3. セッションサマリーの生成  
4. settlement / ledger（元帳）の呼び出し  
5. Session ステータスを COMPLETED に変更  
6. UsageRight ステータスを CONSUMED に変更  
7. machine slot の解放

---

# 13. 加盟店フロー

---

## 13.1 加盟店のオンボーディング
1. merchantアカウントの登録  
2. 資料の提出  
3. Adminによる審査  
4. 承認後、merchantステータスが ACTIVE になる

## 13.2 会場作成
1. Venueの作成  
2. 住所、営業時間、KYC要件の設定  
3. 保存および venueIdHash の生成

## 13.3 機器登録
1. 機器情報の入力  
2. machineId の生成  
3. オンチェーンの MachineRegistry を呼び出し  
4. 成功後、ローカルに onchainTokenId / txHash を書き戻す  
5. ステータスを ACTIVE に切り替える

## 13.4 Usage製品設定
1. 機器または機器プールを選択  
2. 時間枠と価格を設定  
3. 譲渡ルールを設定  
4. KYC要件を設定  
5. 製品の公開  
6. UsageRightの一括mint（設計に応じて実行）

---

# 14. APIレベル定義（アプリケーション層）

---

## 14.1 Consumer（利用者）向けAPI

### GET /v1/venues
用途：会場リストの照会

パラメータ：
- prefecture
- city
- keyword
- machineClass
- date

レスポンス：
- venue の基礎情報
- KYCの要否
- 最安値
- 販売中の商品数

---

### GET /v1/venues/:venueId/usage-products
用途：特定の会場のUsage商品を照会

レスポンス：
- usageProduct リスト
- machineClass
- 時間枠
- 価格
- transferable
- kycLevelRequired

---

### POST /v1/usage-rights/purchase
用途：UsageRightの購入

入力：
- usageProductId
- buyerWallet
- paymentIntentRef

レスポンス：
- usageRightId
- onchainTxHash
- status

べき等性の要件：
- Idempotency-Key は必須

---

### POST /v1/usage-rights/:id/list
用途：UsageRightの出品

入力：
- priceJpyc
- expiryAt

レスポンス：
- listingId
- status

---

### POST /v1/sessions/checkin
入力：
- usageRightId
- venueId
- machineId
- method
- operatorRef（オプション）

レスポンス：
- sessionId
- sessionStatus
- usageRightStatus

---

### POST /v1/sessions/checkout
入力：
- sessionId

レスポンス：
- settlementRef
- status
- txHash（あれば）

---

## 14.2 Merchant（加盟店）向けAPI

### POST /v1/merchant/venues
### POST /v1/merchant/machines
### POST /v1/merchant/usage-products
### POST /v1/merchant/usage-products/:id/publish
### GET /v1/merchant/settlements
### GET /v1/merchant/utilization

---

## 14.3 Admin（管理）向けAPI
### POST /v1/admin/users/:id/freeze
### POST /v1/admin/machines/:id/pause
### POST /v1/admin/disputes/:id/resolve
### GET /v1/admin/chain-ops/pending
### POST /v1/admin/settlement/replay

---

# 15. 異常系フロー

---

## 15.1 決済成功だがオンチェーンの領収（receipt）が遅延
処理：
1. 注文ステータスを PENDING_CHAIN_CONFIRMATION として記録  
2. フロントエンドに「処理中」と表示  
3. event indexer が検知後に更新  
4. タイムアウト後は手動/自動の補填プロセスへ移行

## 15.2 オンチェーンで成功したがデータベースへの書き込み失敗
処理：
1. event indexer による補完書き込み  
2. txHash に基づくべき等な upsert（更新・挿入）  
3. audit log（監査ログ）に補完元を記録

## 15.3 来店したが UsageRight が期限切れ
处理：
- check-in を拒否
- システム遅延が原因の場合は、フロントでの手動確認を許可
- 必要に応じて admin による補填

## 15.4 機器の故障
check-in 前の故障の場合：
- 製品の公開停止
- ユーザーへの返金または代替機への案内

使用中の故障の場合：
- Session を DISPUTED / INTERRUPTED に変更
- ポリシーに基づき返金または利用時間の補填

## 15.5 Computeがリアルユーザーによって中断された場合（予約済み）
処理：
- job ステータスを INTERRUPTED に変更
- 完了比率に応じて決済
- 残りの部分は返金または再スケジューリング

## 15.6 Revenue分配の失敗（予約済み）
处理：
- allocation failure として記録
- distribute をリトライ
- 一部の分配が既に成功している場合、同一の allocate を重複実行することを禁止

---

# 16. リスク管理ルール

---

## 16.1 高頻度な転売
検知：
- 同一ユーザーによる短時間での複数回の出品/購入
- 譲渡 cutoff 直前での異常に頻繁な取引

処理：
- risk flag（リスクフラグ）の付与
- 譲渡の一時停止
- KYC要件の引き上げ

## 16.2 複数アカウントの関連性
検知：
- 同一デバイス
- 同一 IP
- 同一の支払い動線
- 同一の出金/ウォレットパターン

処理：
- リスクマーキング
- 収益権の購入制限
- 二次市場の利用制限

## 16.3 収益権の過剰販売
ルール：
- 単一機器の RevenueRight 合計 shareBps <= 4000 (40%)

## 16.4 slot（スロット）の衝突
ルール：
- machine_slots のユニーク性チェック
- scheduler と DB による二重検証

---

# 17. 运营规则

---

## 17.1 公開ルール
- ACTIVEなMerchantのみが商品を公開可能
- ACTIVEなMachineのみが権利を発行可能
- 競合のない slot のみが Usage / Compute を mint 可能

## 17.2 公開停止ルール
- 販売済みの UsageRight は直接削除不可
- 未成約の listing のみキャンセル可能
- audit trail（監査証跡）の保持が必要

## 17.3 収益権ルール
- RevenueRight の発売前に Admin / Risk による審査が必要
- shareBps はプラットフォームの上限を超えてはならない
- Revenue Program の周期と紐付ける必要がある

---

# 18. データ整合性要件

1. すべてのオンチェーンの領収は、リプレイ（再実行）による同期が可能でなければならない  
2. txHash はユニークであり、重複排除されなければならない  
3. listing、usage、session、ledger はすべて監査可能でなければならない  
4. オンチェーンでの成功 ≠ ビジネスロジックの即時完了、とは限らない  
5. アセットステータスは indexer + DB の同期を正とし、フロントエンドのキャッシュを正としない

---

# 19. 用語およびローカライズ要件

旧版の要件を継承する：

- ユーザーインターフェースの文言は日本語を使用する
- ユーザー向けのエラーメッセージは日本語とする
- APIの message フィールドは日本語とする
- 技術ドキュメント内では日英または日中の併記を認める
- logs（ログ）は英語でよい

---

# 20. 旧版PRDとの継承・代替関係

## 20.1 旧版から継承可能な部分
- 文言の規範
- 推奨技術スタック
- check-in / check-out の考え方
- ledger / べき等性（idempotency）の考え方
- コンプライアンスに関する注意事項
- 一部のAPI命名

## 20.2 旧版をメインPRDとして継続できない理由
- 以前のコアモデルは「座席利用権 + 計算資源レンタル」に留まっていた
- RevenueRight が欠けていた
- Machine Root + Rights Layer の概念がなかった
- 3市場からなる MachineFi の視点が欠けていた
- ナラティブの階層が現在のプロトコル化の方向に合致していなかった

## 20.3 正しい関係
本 PRD v3 を新しいメインドキュメントとする。  
旧版 PRD は歴史的参照用とし、開発のマスターデータとしては使用しない。

---

# 21. 最终定义

NodeStay v3 の核心は「ネットカフェのオンチェーン化」ではなく、以下にある：

> **現実世界の機器資産を収益権、計算資源利用権、施設利用権の3つの市場に分解する MachineFi システム。**

本 PRD v3 は、今後の：
- コントラクト実装
- データベース実装
- API設計
- フロントエンド画面開発
- デモ案
- テスト計画

の統一された実行ドキュメントとして機能するものとする。
