// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title NodeStay 結算コントラクト インターフェース
/// @notice JPYC の hold/capture/release と三方分配結算を担う
interface INodeStaySettlement {

    /// @notice デポジットが凍結された
    event DepositHeld(bytes32 indexed referenceId, address indexed payer, uint256 amount);

    /// @notice デポジットが捕捉（精算）された
    event DepositCaptured(bytes32 indexed referenceId, uint256 amount);

    /// @notice デポジットが解放（返金）された
    event DepositReleased(bytes32 indexed referenceId, uint256 amount);

    /// @notice Usage（使用）が結算された（三方分配）
    event UsageSettled(
        bytes32 indexed sessionId,
        uint256 gross,
        uint256 venueShare,
        uint256 platformShare,
        uint256 revenueShare
    );

    /// @notice Compute（算力）が結算された（三方分配）
    event ComputeSettled(
        bytes32 indexed jobId,
        uint256 gross,
        uint256 venueShare,
        uint256 platformShare,
        uint256 revenueShare
    );

    /// @notice 決済トークンアドレス（JPYC）
    function paymentToken() external view returns (address);

    /// @notice referenceId に紐づくデポジットを凍結する
    function holdDeposit(bytes32 referenceId, address payer, uint256 amount) external;

    /// @notice referenceId のデポジットを捕捉（精算）する
    function captureDeposit(bytes32 referenceId, uint256 amount) external;

    /// @notice referenceId のデポジットを解放（返金）する
    function releaseDeposit(bytes32 referenceId, uint256 amount) external;

    /// @notice Usage 結算：店舗 / プラットフォーム / 収益権ホルダーへ三方分配
    function settleUsage(
        bytes32 sessionId,
        bytes32 machineId,
        address payer,
        address venueTreasury,
        uint256 grossAmount,
        uint16  platformFeeBps,
        uint16  revenueFeeBps
    ) external;

    /// @notice Compute 結算：三方分配（Phase 2）
    function settleCompute(
        bytes32 jobId,
        bytes32 machineId,
        address payer,
        address venueTreasury,
        uint256 grossAmount,
        uint16  platformFeeBps,
        uint16  revenueFeeBps
    ) external;
}
