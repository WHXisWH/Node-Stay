// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {UsageStatus} from "./NodeStayTypes.sol";

/// @title NodeStay 使用権 インターフェース
/// @notice 機器の時間的使用権を ERC-721 として管理する
interface INodeStayUsageRight {

    /// @notice オンチェーン使用権データ
    struct UsageData {
        uint256     usageRightId;       // トークンID
        bytes32     machineId;          // 対象機器ID
        bytes32     machinePoolId;      // 機器プールID（0 = 個別機器指定）
        uint64      startAt;            // 使用開始時刻（UNIX タイムスタンプ）
        uint64      endAt;              // 使用終了時刻
        uint8       usageType;          // 使用権種別（0=HOURLY, 1=PACK, 2=NIGHT, 3=FLEX）
        bool        transferable;       // 転送可能フラグ
        uint64      transferCutoff;     // 転送締切時刻（この時刻以降は転送不可）
        uint8       maxTransferCount;   // 最大転送回数
        uint8       transferCount;      // 現在の転送回数
        uint8       kycLevelRequired;   // 必要 KYC レベル
        UsageStatus status;             // 使用権状態
        string      metadataURI;        // メタデータ URI
    }

    event UsageRightMinted(uint256 indexed usageRightId, bytes32 indexed machineId, address indexed to);
    event UsageRightStatusUpdated(uint256 indexed usageRightId, UsageStatus status);
    event UsageRightConsumed(uint256 indexed usageRightId);
    event UsageRightCancelled(uint256 indexed usageRightId);
    event UsageRightLocked(uint256 indexed usageRightId);
    event UsageRightUnlocked(uint256 indexed usageRightId);

    /// @notice 使用権NFTを発行する（購入時にオペレータが呼び出す）
    function mintUsageRight(
        address to,
        bytes32 machineId,
        bytes32 machinePoolId,
        uint64  startAt,
        uint64  endAt,
        uint8   usageType,
        bool    transferable,
        uint64  transferCutoff,
        uint8   maxTransferCount,
        uint8   kycLevelRequired,
        string  calldata metadataURI
    ) external returns (uint256 usageRightId);

    /// @notice 使用権を消費する（チェックアウト時）
    function consumeUsageRight(uint256 usageRightId) external;

    /// @notice 使用権をキャンセルする
    function cancelUsageRight(uint256 usageRightId) external;

    /// @notice 使用権をロックする（チェックイン直前）
    function lockUsageRight(uint256 usageRightId) external;

    /// @notice 使用権のロックを解除する
    function unlockUsageRight(uint256 usageRightId) external;

    /// @notice 転送が現在許可されているか確認する
    function isTransferAllowed(uint256 usageRightId) external view returns (bool);

    /// @notice 使用権データを取得する
    function getUsageData(uint256 usageRightId) external view returns (UsageData memory);
}
