# NodeStay / MachineFi ホワイトペーパー・アウトライン
バージョン：v1.0 Draft  
チェーン：Polygon  
決済資産：JPYC

---

## 1. Executive Summary（エグゼクティブ・サマリー）

NodeStayは、現実世界の機器資産（物理マシン）のための金融層および市場層を構築している。

NodeStayの核心は「ネットカフェ向けソフトウェア」でも「シンプルなWeb3決済アプリ」でもなく、以下にある：

> **現実世界における機器資産（Machine Asset）を、プログラム可能で取引可能、かつ決済可能な経済的権利に分解すること。**

第一段階として、NodeStayは日本のネットカフェをエントリーポイントとする。  
その理由は、ネットカフェが天然の形で以下の要素を備えているからである：

- 既に配備されている大量の高性能機器
- 明確なアイドル時間（空き時間）
- 成熟した時間枠単位の課金モデル
- 物理的な利用と計算資源供給という二重の属性への拡張性

NodeStayは、各機器を以下の3つの経済的権利に分解する：

1. **Usage Right（施設利用権）**
2. **Compute Right（計算資源利用権）**
3. **Revenue Right（収益権）**

これらの権利は Polygon 上のトークン化標準によって表現され、決済レイヤーとして JPYC が統合される。  
ユーザーはこれらの権利に対して、以下の行為が可能となる：

- 購入
- 投資
- 譲渡
- 利用
- 収益分配の受領

NodeStayの長期的な目標は、単一のネットカフェシーンへのサービス提供に留まらず、以下へと発展することである：

> **MachineFi：現実世界の機器資産ネットワークのためのプロトコル層。**

---

## 2. Problem & Opportunity（課題と機会）

### 2.1 現実世界の機器資産における非効率性

現実のビジネスにおいて、1台の機器は往々にして単一の収益化手段しか持たない。  
例えばネットカフェのシーンでは、1台のPCは通常「ユーザーの来店利用」によってのみ収入を生む。

これにより、以下の3つの構造的な課題が生じている：

1. **アイドル時間（空き時間）を収益化できない**
2. **将来のキャッシュフローを分解して資金調達に充てることができない**
3. **ユーザーの利用権を標準化して流通させることができない**

### 2.2 なぜ今なのか

現在、以下の3つの新たな機会が訪れている：

- Web3 が資産の権利確定（確権）と自動決済の能力を提供している
- Polygon が低コストかつ高頻度な取引のための実行層を提供している
- JPYC が日本国内のシーンに適した安定した決済資産を提供している

### 2.3 市場の機会

ネットカフェは第一歩に過ぎない。  
機器資産が正常に標準化されれば、将来的には以下へと拡張できる：

- eスポーツ施設
- レンダリングファーム
- エッジノード
- 家庭用GPUネットワーク
- AIキオスク / ローカル推論ノード

---

## 3. Why Internet Cafes（なぜネットカフェなのか）

### 3.1 最初のシーンとしての優位性

日本のネットカフェは、MachineFi を検証するのに最も適した現実世界のシーンの一つである。なぜなら以下を備えているからである：

- 大量に存在する既存のハードウェア
- 既に存在する席と時間枠の管理体制
- ピーク時とオフピーク時における明確な利用率の差
- 「人」にも「計算」にもサービスを提供できる特性

### 3.2 従来のビジネスモデルの限界

ネットカフェの収入構造は通常以下の通りである：

- 時間パック料金
- 夜間パック
- 飲食等の付随販売

課題は以下の通り：

- 日中のオフピーク時に機器がアイドル状態になる
- 機器資産を複数の収益層に分解できない
- 投資家を直接個別の機器収益に呼び込むことができない

### 3.3 重要な判断

> **日本には既に分散型の機器ネットワークが存在しているが、まだ金融化されていないだけである。**

---

## 4. MachineFi Concept（MachineFiのコンセプト）

### 4.1 MachineFi とは何か

NodeStayにおける MachineFi とは以下を指す：

> **現実世界の機器を多層的な経済的資産に変え、それらの経済的権利がオープンな市場で取引・決済されるようにすること。**

### 4.2 従来モデルとの違い

従来モデル：
```text
Machine → Usage Revenue only（施設利用収入のみ）
```

NodeStay モデル：
```text
Machine
├─ Usage Right（施設利用権）
├─ Compute Right（計算資源利用権）
└─ Revenue Right（収益権）
```

### 4.3 真のイノベーションポイント

NodeStayの革新性は「3つの市場を作ったこと」ではなく、以下にある：

> **1台の物理的な機器を多層的な経済的権利（Economic Rights Stack）に分解したこと。**

---

## 5. Machine Asset Stack（機器資産スタック）

### 5.1 Machine Root（機器ルート）
Machine Root は親資産であり、登録済みの1台の現実の機器を表す。

### 5.2 Usage Right（施設利用権）
特定の機器または機器プールの特定の時間枠における物理的な利用権。

### 5.3 Compute Right（計算資源利用権）
特定の機器の特定の時間枠における計算資源の利用権。

### 5.4 Revenue Right（収益权）
特定の機器の将来の収益の一部の分配を受ける権利。

### 5.5 3層の権利の関係
```text
Machine Root
├─ Usage Rights
├─ Compute Rights
└─ Revenue Rights
```

---

## 6. Three Markets（3つの市場）

### 6.1 Usage Market（施設利用市場）
取引対象：Usage Right  
対象者：消費者、時間権益のトレーダー

### 6.2 Compute Market（計算資源市場）
取引対象：Compute Right  
対象者：AI / レンダリング / ZK タスクの需要家

### 6.3 Revenue Market（収益市場）
取引対象：Revenue Right  
対象者：投資家、二次市場のトレーダー

### 6.4 3市場の正の循環
```text
Usage が利用率を向上させる
→ 収入が増加する
→ Revenue の魅力が増す
→ より多くの機器が参加する
→ Compute 市場が拡大する
→ 機器の総収益がさらに成長する
```

---

## 7. Tokenization Standard（トークン化標準）

### 7.1 標準設計の原則
- Asset Root + Rights Layer
- 決済と実行の分離
- 確権（権利確定）と決済のためにオンチェーンを使用
- スケジューリングと実行のためにオフチェーンを使用

### 7.2 推奨標準
- Machine Root：ERC-721
- Usage Right：ERC-721（MVP）
- Compute Right：ERC-721
- Revenue Right：ERC-1155
- Settlement Token：JPYC（ERC-20）

### 7.3 Transferability（譲渡可能性）
- Usage Right：一部譲渡可能
- Compute Right：実行開始前は譲渡可能
- Revenue Right：譲渡可能、二次取引をサポート
- Machine Root：デフォルトで流通させない

---

## 8. On-chain / Off-chain Architecture（アーキテクチャ）

### 8.1 On-chain（オンチェーン）
- Machine Root の登録
- 3つの権利の mint / transfer
- JPYC のエスクローおよび利益分配
- 収益分配の結果記録

### 8.2 Off-chain（オフチェーン）
- スケジューラ（scheduler）
- 計算タスクの実行（execution）
- check-in / check-out
- 機器ステータスの監視（monitoring）
- KYC明文の保存
- 紛争（dispute）のエビデンス原本

### 8.3 コア原則
> **Blockchain is used for trust, not for computation.**
> （ブロックチェーンは信頼のために使われ、計算のために使われるのではない。）

---

## 9. Economic Model（経済モデル）

### 9.1 収益公式
```text
R = U + C
```
ここで：
- U = Usage Revenue（施設利用収入）
- C = Compute Revenue（計算資源利用収入）

### 9.2 収益権の分配
```text
Investor Income = R × Share
```

### 9.3 プラットフォーム収入
- Usage 手数料
- Compute サービス料
- Revenue 市場の発行・取引手数料

### 9.4 動的価格設定（ダイナミック・プライシング）
Usage の価格設定案：

```text
Price = BasePrice × DemandFactor × TimeFactor × ScarcityFactor
```

Compute の価格設定案：

```text
ComputePrice = GPUBase × UtilizationFactor × UrgencyFactor
```

---

## 10. JPYC Settlement Layer（決済層）

### 10.1 なぜ JPYC なのか
- 日本円建て
- 安定した資産
- 日本国内のユーザーおよび運営者に適している
- 自動的な分配および周期的な収益分配をサポート

### 10.2 JPYC の役割
投機対象ではなく、以下を目指す：
> **NodeStay 経済システムの安定した決済層**

### 10.3 ユースケース
- Usage の支払い
- Compute の支払い
- デポジットの hold / release
- Revenue の分配（distribution）

---

## 11. Compliance & Risk（コンプライアンスとリスク）

### 11.1 コンプライアンスの境界
- ネットカフェのシーンでは KYC / 本人確認が必要
- 収益権は金融規制の境界に抵触する可能性がある
- AML / リスク管理 / 紛争（dispute）メカニズムの考慮が必要

### 11.2 技術的なリスク管理
- 二重販売（ダブルセリング）の防止
- 占有の衝突制御
- RevenueRight の発行比率の上限設定
- 一時停止（pause） / 凍結（freeze）メカニズム
- スケジューラの優先順位制御

---

## 12. MVP & Roadmap（ロードマップ）

### Phase 1
- Machine Registry
- UsageRight
- JPYC による購入とオンチェーン記録
- check-in / check-out のオフチェーンクローズドループ

### Phase 2
- ComputeRight
- 基礎的な計算タスク・スケジューリング
- 中断可能な計算資源決済（preemptible compute settlement）

### Phase 3
- RevenueRight
- 周期的な収益分配
- 投資家向け市場

### Phase 4
- より多くの機器シーンへの拡張
- Machine Asset Network（機器資産ネットワーク）の形成

---

## 13. Go-To-Market（市場参入戦略）

### 第一段階
- 少数の個人経営ネットカフェでの実証実験
- ハイスペック機器の小規模な展開
- まず UsageRight + JPYC Settlement を検証

### 第二段階
- 複数店舗共通の利用権
- 二次譲渡機能
- 動的価格設定（ダイナミック・プライシング）

### 第三段階
- Compute Market の導入
- Revenue Market の導入

---

## 14. Long-term Vision（長期ビジョン）

NodeStayの長期的なビジョンは、ネットカフェ向けのツールを作ることではなく、以下にある：

> **現実世界の機器資産のための金融層および市場層の構築。**

将来的に、Usage / Compute / Revenue を生み出すことができるあらゆる物理的な機器が、NodeStayプロトコルに参加できるようになる。

### 最終定義
NodeStay is building the financial layer for physical machines.
