// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {INodeStaySettlement} from "./interfaces/INodeStaySettlement.sol";

/// @title NodeStay 結算コントラクト
/// @notice JPYC のデポジット管理と三方分配（店舗 / プラットフォーム / 収益権）を担う
/// @dev referenceId（bytes32）を基本単位としてデポジットを管理する
///      ReentrancyGuard でリエントランシーを防止する
contract NodeStaySettlement is Ownable, ReentrancyGuard, INodeStaySettlement {

    // -----------------------------------------------------------------------
    // 定数
    // -----------------------------------------------------------------------

    /// @notice BPS 分母（10000 = 100%）
    uint16 public constant FEE_DENOMINATOR = 10000;

    // -----------------------------------------------------------------------
    // 状態変数
    // -----------------------------------------------------------------------

    /// @notice 決済トークン（JPYC）
    IERC20 public immutable token;

    /// @notice オペレータアドレス（バックエンドサービス）
    address public operator;

    /// @notice プラットフォーム手数料受取ウォレット
    address public platformTreasury;

    /// @notice referenceId → 凍結額
    mapping(bytes32 => uint256) public heldAmount;

    /// @notice referenceId → デポジット支払者（解放時の返金先）
    mapping(bytes32 => address) public depositPayer;

    // -----------------------------------------------------------------------
    // カスタムエラー
    // -----------------------------------------------------------------------

    error NotOperator();
    error ZeroAddress();
    error InsufficientHeld();
    error AlreadyHeld();
    error InvalidFeeParams();
    error TransferFailed();

    // -----------------------------------------------------------------------
    // 修飾子
    // -----------------------------------------------------------------------

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    // -----------------------------------------------------------------------
    // コンストラクタ
    // -----------------------------------------------------------------------

    constructor(address token_, address platformTreasury_) Ownable(msg.sender) {
        if (token_ == address(0)) revert ZeroAddress();
        if (platformTreasury_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        platformTreasury = platformTreasury_;
    }

    // -----------------------------------------------------------------------
    // 管理関数（Owner）
    // -----------------------------------------------------------------------

    /// @notice オペレータアドレスを設定する
    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
    }

    /// @notice プラットフォーム手数料受取ウォレットを更新する
    function setPlatformTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        platformTreasury = treasury_;
    }

    // -----------------------------------------------------------------------
    // INodeStaySettlement 実装：デポジット管理
    // -----------------------------------------------------------------------

    /// @inheritdoc INodeStaySettlement
    function paymentToken() external view returns (address) {
        return address(token);
    }

    /// @inheritdoc INodeStaySettlement
    /// @notice payer から referenceId に紐づくデポジットを凍結する
    function holdDeposit(
        bytes32 referenceId,
        address payer,
        uint256 amount
    ) external onlyOperator nonReentrant {
        if (payer == address(0)) revert ZeroAddress();
        if (heldAmount[referenceId] != 0) revert AlreadyHeld();

        bool ok = token.transferFrom(payer, address(this), amount);
        if (!ok) revert TransferFailed();

        heldAmount[referenceId]  = amount;
        depositPayer[referenceId] = payer;

        emit DepositHeld(referenceId, payer, amount);
    }

    /// @inheritdoc INodeStaySettlement
    /// @notice referenceId のデポジットをプラットフォームに捕捉（精算）する
    function captureDeposit(bytes32 referenceId, uint256 amount)
        external
        onlyOperator
        nonReentrant
    {
        if (heldAmount[referenceId] < amount) revert InsufficientHeld();

        heldAmount[referenceId] -= amount;

        bool ok = token.transfer(platformTreasury, amount);
        if (!ok) revert TransferFailed();

        emit DepositCaptured(referenceId, amount);
    }

    /// @inheritdoc INodeStaySettlement
    /// @notice referenceId のデポジットを支払者へ解放（返金）する
    function releaseDeposit(bytes32 referenceId, uint256 amount)
        external
        onlyOperator
        nonReentrant
    {
        if (heldAmount[referenceId] < amount) revert InsufficientHeld();

        address payer = depositPayer[referenceId];
        if (payer == address(0)) revert ZeroAddress();

        heldAmount[referenceId] -= amount;

        bool ok = token.transfer(payer, amount);
        if (!ok) revert TransferFailed();

        emit DepositReleased(referenceId, amount);
    }

    // -----------------------------------------------------------------------
    // INodeStaySettlement 実装：結算
    // -----------------------------------------------------------------------

    /// @inheritdoc INodeStaySettlement
    /// @notice Usage 結算：payer → 三方分配（venue / platform / revenue）
    /// @param platformFeeBps プラットフォーム手数料率（BPS、例: 500 = 5%）
    /// @param revenueFeeBps  収益権ホルダー分配率（BPS）
    function settleUsage(
        bytes32 sessionId,
        bytes32 /* machineId */,
        address payer,
        address venueTreasury,
        uint256 grossAmount,
        uint16  platformFeeBps,
        uint16  revenueFeeBps
    ) external onlyOperator nonReentrant {
        _settle(
            sessionId,
            payer,
            venueTreasury,
            grossAmount,
            platformFeeBps,
            revenueFeeBps,
            true
        );
    }

    /// @inheritdoc INodeStaySettlement
    /// @notice Compute 結算：payer → 三方分配（Phase 2）
    function settleCompute(
        bytes32 jobId,
        bytes32 /* machineId */,
        address payer,
        address venueTreasury,
        uint256 grossAmount,
        uint16  platformFeeBps,
        uint16  revenueFeeBps
    ) external onlyOperator nonReentrant {
        _settle(
            jobId,
            payer,
            venueTreasury,
            grossAmount,
            platformFeeBps,
            revenueFeeBps,
            false
        );
    }

    // -----------------------------------------------------------------------
    // 内部関数
    // -----------------------------------------------------------------------

    /// @notice 三方分配の共通ロジック
    /// @param referenceId   セッションID / ジョブID
    /// @param payer         支払者
    /// @param venueTreasury 店舗収益受取ウォレット
    /// @param grossAmount   総額
    /// @param platformFeeBps プラットフォーム手数料率（BPS）
    /// @param revenueFeeBps  収益権ホルダー分配率（BPS）
    /// @param isUsage        true = Usage 結算, false = Compute 結算
    function _settle(
        bytes32 referenceId,
        address payer,
        address venueTreasury,
        uint256 grossAmount,
        uint16  platformFeeBps,
        uint16  revenueFeeBps,
        bool    isUsage
    ) internal {
        if (venueTreasury == address(0)) revert ZeroAddress();
        if (payer == address(0)) revert ZeroAddress();
        if (uint256(platformFeeBps) + uint256(revenueFeeBps) > FEE_DENOMINATOR) revert InvalidFeeParams();

        // payer から総額を受け取る
        bool ok = token.transferFrom(payer, address(this), grossAmount);
        if (!ok) revert TransferFailed();

        // 三方分配計算
        uint256 platformShare = (grossAmount * platformFeeBps) / FEE_DENOMINATOR;
        uint256 revenueShare  = (grossAmount * revenueFeeBps)  / FEE_DENOMINATOR;
        uint256 venueShare    = grossAmount - platformShare - revenueShare;

        // 店舗へ送金
        if (venueShare > 0) {
            ok = token.transfer(venueTreasury, venueShare);
            if (!ok) revert TransferFailed();
        }

        // プラットフォームへ送金
        if (platformShare > 0) {
            ok = token.transfer(platformTreasury, platformShare);
            if (!ok) revert TransferFailed();
        }

        // 収益権分（現時点はコントラクト内に留保、Phase 3 で distributeRevenue へ）
        // revenueShare は this に残る

        if (isUsage) {
            emit UsageSettled(referenceId, grossAmount, venueShare, platformShare, revenueShare);
        } else {
            emit ComputeSettled(referenceId, grossAmount, venueShare, platformShare, revenueShare);
        }
    }
}
