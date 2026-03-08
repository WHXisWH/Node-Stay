# NodeStay Solidity インターフェース草案
バージョン：v1.0 Draft  
言語：Solidity Interface Level Spec  
チェーン：Polygon

---

## 1. 目的

本ドキュメントは、NodeStayプロトコルのSolidityインターフェース草案を定義する。  
その目標は、コントラクトモジュールの境界を統一し、以下のプロセスを円滑にすることにある：

- スマートコントラクトの開発
- 監査の準備
- フロントエンド・バックエンドの連携
- プロトコルインターフェースの凍結（確定）

本ドキュメントは **インターフェースレベルの設計** であり、最終的なデプロイ用実装ではない。

---

## 2. モジュール概要

NodeStayのコアとなるコントラクトモジュールは以下の通り推奨される：

1. `INodeStayMachineRegistry`
2. `INodeStayUsageRight`
3. `INodeStayComputeRight`
4. `INodeStayRevenueRight`
5. `INodeStaySettlement`
6. `INodeStayMarketplace`
7. `INodeStayKYCGate`（オプション）
8. `INodeStayDisputeResolver`（オプション）

---

## 3. Shared Types（共通型）

```solidity
enum MachineStatus {
    REGISTERED,    // 登録済み
    ACTIVE,        // 有効
    PAUSED,        // 一時停止
    MAINTENANCE,   // メンテナンス中
    DECOMMISSIONED // 廃棄済み
}

enum UsageStatus {
    MINTED,      // 発行済み
    LISTED,      // 出品中
    LOCKED,      // ロック済み
    CHECKED_IN,  // チェックイン済み
    CONSUMED,    // 消費済み
    EXPIRED,     // 期限切れ
    CANCELLED    // キャンセル済み
}

enum ComputeStatus {
    ISSUED,      // 発行済み
    LISTED,      // 出品中
    RESERVED,    // 予約済み
    RUNNING,     // 実行中
    COMPLETED,   // 完了
    INTERRUPTED, // 中断
    FAILED,      // 失敗
    EXPIRED      // 期限切れ
}

enum RevenueStatus {
    ISSUED,   // 発行済み
    ACTIVE,   // 有効
    PAUSED,   // 一時停止
    EXPIRED,  // 期限切れ
    REDEEMED  // 償還済み
}

enum RevenueScope {
    USAGE_ONLY,   // 施設利用のみ
    COMPUTE_ONLY, // 計算資源のみ
    ALL           // 全て
}
```

---

## 4. INodeStayMachineRegistry

```solidity
interface INodeStayMachineRegistry {
    struct MachineData {
        bytes32 machineId;
        bytes32 venueIdHash;
        address owner;
        uint8 machineClass;
        MachineStatus status;
        bytes32 specHash;
        string metadataURI;
    }

    event MachineRegistered(bytes32 indexed machineId, address indexed owner);
    event MachineStatusUpdated(bytes32 indexed machineId, MachineStatus status);
    event MachineMetadataUpdated(bytes32 indexed machineId, string metadataURI);
    event MachineOwnerUpdated(bytes32 indexed machineId, address indexed newOwner);

    function registerMachine(
        bytes32 venueIdHash,
        uint8 machineClass,
        bytes32 specHash,
        string calldata metadataURI
    ) external returns (bytes32 machineId);

    function updateMachineStatus(bytes32 machineId, MachineStatus status) external;
    function updateMachineMetadata(bytes32 machineId, string calldata metadataURI) external;
    function transferMachineRoot(bytes32 machineId, address newOwner) external;
    function getMachine(bytes32 machineId) external view returns (MachineData memory);
    function exists(bytes32 machineId) external view returns (bool);
}
```

---

## 5. INodeStayUsageRight

```solidity
interface INodeStayUsageRight {
    struct UsageData {
        uint256 usageRightId;
        bytes32 machineId;
        bytes32 machinePoolId;
        uint64 startAt;
        uint64 endAt;
        uint8 usageType;
        bool transferable;
        uint64 transferCutoff;
        uint8 maxTransferCount;
        uint8 transferCount;
        uint8 kycLevelRequired;
        UsageStatus status;
        string metadataURI;
    }

    event UsageRightMinted(uint256 indexed usageRightId, bytes32 indexed machineId, address indexed to);
    event UsageRightStatusUpdated(uint256 indexed usageRightId, UsageStatus status);
    event UsageRightConsumed(uint256 indexed usageRightId);
    event UsageRightCancelled(uint256 indexed usageRightId);
    event UsageRightLocked(uint256 indexed usageRightId);

    function mintUsageRight(
        address to,
        bytes32 machineId,
        bytes32 machinePoolId,
        uint64 startAt,
        uint64 endAt,
        uint8 usageType,
        bool transferable,
        uint64 transferCutoff,
        uint8 maxTransferCount,
        uint8 kycLevelRequired,
        string calldata metadataURI
    ) external returns (uint256 usageRightId);

    function consumeUsageRight(uint256 usageRightId) external;
    function cancelUsageRight(uint256 usageRightId) external;
    function lockUsageRight(uint256 usageRightId) external;
    function unlockUsageRight(uint256 usageRightId) external;
    function setUsageStatus(uint256 usageRightId, UsageStatus status) external;
    function isTransferAllowed(uint256 usageRightId) external view returns (bool);
    function getUsageData(uint256 usageRightId) external view returns (UsageData memory);
}
```

---

## 6. INodeStayComputeRight

```solidity
interface INodeStayComputeRight {
    struct ComputeData {
        uint256 computeRightId;
        bytes32 machineId;
        uint8 computeTier;
        uint64 startWindow;
        uint64 endWindow;
        uint64 maxDurationMinutes;
        bool preemptible;
        uint8 settlementPolicy;
        ComputeStatus status;
        string metadataURI;
    }

    event ComputeRightMinted(uint256 indexed computeRightId, bytes32 indexed machineId, address indexed to);
    event ComputeRightReserved(uint256 indexed computeRightId, bytes32 indexed jobId);
    event ComputeRightStatusUpdated(uint256 indexed computeRightId, ComputeStatus status);

    function mintComputeRight(
        address to,
        bytes32 machineId,
        uint8 computeTier,
        uint64 startWindow,
        uint64 endWindow,
        uint64 maxDurationMinutes,
        bool preemptible,
        uint8 settlementPolicy,
        string calldata metadataURI
    ) external returns (uint256 computeRightId);

    function reserveComputeRight(uint256 computeRightId, bytes32 jobId) external;
    function markRunning(uint256 computeRightId) external;
    function markCompleted(uint256 computeRightId) external;
    function markInterrupted(uint256 computeRightId) external;
    function markFailed(uint256 computeRightId) external;
    function getComputeData(uint256 computeRightId) external view returns (ComputeData memory);
}
```

---

## 7. INodeStayRevenueRight

```solidity
interface INodeStayRevenueRight {
    struct RevenueData {
        uint256 revenueRightId;
        bytes32 machineId;
        uint16 shareBps;
        RevenueScope revenueScope;
        uint64 startAt;
        uint64 endAt;
        address payoutToken;
        uint8 settlementCycle;
        RevenueStatus status;
        string metadataURI;
    }

    event RevenueRightIssued(uint256 indexed revenueRightId, bytes32 indexed machineId, uint16 shareBps);
    event RevenueAllocated(uint256 indexed revenueRightId, uint256 amount);
    event RevenueClaimed(uint256 indexed revenueRightId, address indexed claimer, uint256 amount);
    event RevenueStatusUpdated(uint256 indexed revenueRightId, RevenueStatus status);

    function issueRevenueRight(
        address to,
        bytes32 machineId,
        uint16 shareBps,
        RevenueScope revenueScope,
        uint64 startAt,
        uint64 endAt,
        address payoutToken,
        uint8 settlementCycle,
        string calldata metadataURI,
        uint256 amount1155
    ) external returns (uint256 revenueRightId);

    function allocateRevenue(uint256 revenueRightId, uint256 amount) external;
    function claimRevenue(uint256 revenueRightId) external returns (uint256 claimedAmount);
    function pauseRevenueRight(uint256 revenueRightId) external;
    function expireRevenueRight(uint256 revenueRightId) external;
    function getRevenueData(uint256 revenueRightId) external view returns (RevenueData memory);
}
```

---

## 8. INodeStaySettlement

```solidity
interface INodeStaySettlement {
    event DepositHeld(bytes32 indexed referenceId, address indexed payer, uint256 amount);
    event DepositCaptured(bytes32 indexed referenceId, uint256 amount);
    event DepositReleased(bytes32 indexed referenceId, uint256 amount);
    event UsageSettled(bytes32 indexed sessionId, uint256 gross, uint256 venueShare, uint256 platformShare, uint256 revenueShare);
    event ComputeSettled(bytes32 indexed jobId, uint256 gross, uint256 venueShare, uint256 platformShare, uint256 revenueShare);

    function paymentToken() external view returns (address);

    function holdDeposit(bytes32 referenceId, address payer, uint256 amount) external;
    function captureDeposit(bytes32 referenceId, uint256 amount) external;
    function releaseDeposit(bytes32 referenceId, uint256 amount) external;

    function settleUsage(
        bytes32 sessionId,
        bytes32 machineId,
        address payer,
        address venueTreasury,
        uint256 grossAmount,
        uint16 platformFeeBps,
        uint16 revenueFeeBps
    ) external;

    function settleCompute(
        bytes32 jobId,
        bytes32 machineId,
        address payer,
        address venueTreasury,
        uint256 grossAmount,
        uint16 platformFeeBps,
        uint16 revenueFeeBps
    ) external;

    function distributeRevenue(
        uint256 revenueRightId,
        uint256 amount
    ) external;
}
```

---

## 9. INodeStayMarketplace

```solidity
interface INodeStayMarketplace {
    enum ListingType {
        USAGE,
        COMPUTE,
        REVENUE
    }

    struct Listing {
        uint256 listingId;
        ListingType listingType;
        address collection;
        uint256 tokenId;
        address seller;
        uint256 amount;
        uint256 price;
        uint64 expiry;
        bool active;
    }

    event ListingCreated(uint256 indexed listingId, address indexed seller, address indexed collection, uint256 tokenId, uint256 price);
    event ListingCancelled(uint256 indexed listingId);
    event ListingPurchased(uint256 indexed listingId, address indexed buyer, uint256 price);

    function createListing(
        ListingType listingType,
        address collection,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        uint64 expiry
    ) external returns (uint256 listingId);

    function cancelListing(uint256 listingId) external;
    function buyListing(uint256 listingId) external;
    function getListing(uint256 listingId) external view returns (Listing memory);
}
```

---

## 10. INodeStayKYCGate（オプション）

```solidity
interface INodeStayKYCGate {
    event KYCStatusUpdated(address indexed user, uint8 level, bytes32 proofHash);

    function setKYCStatus(address user, uint8 level, bytes32 proofHash) external;
    function getKYCLevel(address user) external view returns (uint8);
    function hasRequiredLevel(address user, uint8 requiredLevel) external view returns (bool);
}
```

---

## 11. INodeStayDisputeResolver（オプション）

```solidity
interface INodeStayDisputeResolver {
    enum DisputeStatus {
        OPEN,         // オープン
        UNDER_REVIEW, // 審査中
        RESOLVED,     // 解決済み
        REJECTED      // 却下
    }

    event DisputeOpened(bytes32 indexed disputeId, bytes32 indexed referenceId, address indexed opener);
    event DisputeResolved(bytes32 indexed disputeId, DisputeStatus status);

    function openDispute(bytes32 referenceId, bytes32 evidenceHash) external returns (bytes32 disputeId);
    function resolveDispute(bytes32 disputeId, DisputeStatus status, bytes32 decisionHash) external;
}
```

---

## 12. 開発へのアドバイス

### 12.1 MVP で優先的に確定（凍結）させるべきインターフェース
最優先：
- MachineRegistry
- UsageRight
- Settlement

### 12.2 後回しにできるもの
第2段階以降で確定させればよいもの：
- ComputeRight
- RevenueRight
- Marketplace の全機能

### 12.3 監査の重点
- リエントランシー（再入性）と権限管理
- 収益分配比率の正確性
- deposit の hold / capture / release のステータス安全性
- 二重請求（領収）の防止
- listing / transfer の制限の一貫性

---

## 13. 結論

NodeStayのSolidityインターフェースは単なる「NFTコントラクト」ではなく、以下を目指すものである：

> **現実世界の機器資産に向けた、多層的な権利、複数の市場、および複数の決済レイヤーを備えたプロトコルインターフェース群。**
