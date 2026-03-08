// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {INodeStayUsageRight} from "./interfaces/INodeStayUsageRight.sol";
import {UsageStatus} from "./interfaces/NodeStayTypes.sol";

/// @title NodeStay 使用権NFT
/// @notice 機器の時間的使用権（Usage Right）を ERC-721 として管理する
/// @dev 転送可否・転送期限・転送回数上限をオンチェーンで強制する
contract NodeStayUsageRight is ERC721, Ownable, INodeStayUsageRight {

    // -----------------------------------------------------------------------
    // 状態変数
    // -----------------------------------------------------------------------

    /// @notice オペレータアドレス（バックエンドサービス）
    address public operator;

    /// @notice 次のトークンID（1始まり）
    uint256 public nextTokenId = 1;

    /// @notice tokenId → UsageData
    mapping(uint256 => UsageData) private _usageData;

    // -----------------------------------------------------------------------
    // カスタムエラー
    // -----------------------------------------------------------------------

    error NotOperator();
    error ZeroAddress();
    error TokenNotFound();
    error NotTransferable();
    error TransferCutoffPassed();
    error MaxTransferCountReached();
    error AlreadyConsumed();
    error AlreadyCancelled();
    error InvalidStatus(UsageStatus current);

    // -----------------------------------------------------------------------
    // 修飾子
    // -----------------------------------------------------------------------

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    modifier tokenExists(uint256 usageRightId) {
        if (_ownerOf(usageRightId) == address(0)) revert TokenNotFound();
        _;
    }

    // -----------------------------------------------------------------------
    // コンストラクタ
    // -----------------------------------------------------------------------

    constructor() ERC721("NodeStay Usage Right", "NSUR") Ownable(msg.sender) {}

    // -----------------------------------------------------------------------
    // 管理関数（Owner）
    // -----------------------------------------------------------------------

    /// @notice オペレータアドレスを設定する
    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
    }

    // -----------------------------------------------------------------------
    // INodeStayUsageRight 実装
    // -----------------------------------------------------------------------

    /// @inheritdoc INodeStayUsageRight
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
    ) external onlyOperator returns (uint256 usageRightId) {
        if (to == address(0)) revert ZeroAddress();

        usageRightId = nextTokenId++;
        _safeMint(to, usageRightId);

        _usageData[usageRightId] = UsageData({
            usageRightId:     usageRightId,
            machineId:        machineId,
            machinePoolId:    machinePoolId,
            startAt:          startAt,
            endAt:            endAt,
            usageType:        usageType,
            transferable:     transferable,
            transferCutoff:   transferCutoff,
            maxTransferCount: maxTransferCount,
            transferCount:    0,
            kycLevelRequired: kycLevelRequired,
            status:           UsageStatus.MINTED,
            metadataURI:      metadataURI
        });

        emit UsageRightMinted(usageRightId, machineId, to);
    }

    /// @inheritdoc INodeStayUsageRight
    function consumeUsageRight(uint256 usageRightId)
        external
        onlyOperator
        tokenExists(usageRightId)
    {
        UsageData storage d = _usageData[usageRightId];
        if (d.status == UsageStatus.CONSUMED) revert AlreadyConsumed();
        if (d.status == UsageStatus.CANCELLED) revert AlreadyCancelled();

        d.status = UsageStatus.CONSUMED;
        emit UsageRightConsumed(usageRightId);
        emit UsageRightStatusUpdated(usageRightId, UsageStatus.CONSUMED);
    }

    /// @inheritdoc INodeStayUsageRight
    function cancelUsageRight(uint256 usageRightId)
        external
        onlyOperator
        tokenExists(usageRightId)
    {
        UsageData storage d = _usageData[usageRightId];
        if (d.status == UsageStatus.CONSUMED) revert AlreadyConsumed();
        if (d.status == UsageStatus.CANCELLED) revert AlreadyCancelled();

        d.status = UsageStatus.CANCELLED;
        emit UsageRightCancelled(usageRightId);
        emit UsageRightStatusUpdated(usageRightId, UsageStatus.CANCELLED);
    }

    /// @inheritdoc INodeStayUsageRight
    function lockUsageRight(uint256 usageRightId)
        external
        onlyOperator
        tokenExists(usageRightId)
    {
        UsageData storage d = _usageData[usageRightId];
        if (d.status != UsageStatus.MINTED && d.status != UsageStatus.LISTED) {
            revert InvalidStatus(d.status);
        }
        d.status = UsageStatus.LOCKED;
        emit UsageRightLocked(usageRightId);
        emit UsageRightStatusUpdated(usageRightId, UsageStatus.LOCKED);
    }

    /// @inheritdoc INodeStayUsageRight
    function unlockUsageRight(uint256 usageRightId)
        external
        onlyOperator
        tokenExists(usageRightId)
    {
        UsageData storage d = _usageData[usageRightId];
        if (d.status != UsageStatus.LOCKED) revert InvalidStatus(d.status);
        d.status = UsageStatus.MINTED;
        emit UsageRightUnlocked(usageRightId);
        emit UsageRightStatusUpdated(usageRightId, UsageStatus.MINTED);
    }

    /// @inheritdoc INodeStayUsageRight
    function isTransferAllowed(uint256 usageRightId)
        public
        view
        tokenExists(usageRightId)
        returns (bool)
    {
        UsageData storage d = _usageData[usageRightId];
        if (!d.transferable) return false;
        if (d.status != UsageStatus.MINTED && d.status != UsageStatus.LISTED) return false;
        if (d.transferCount >= d.maxTransferCount) return false;
        if (d.transferCutoff != 0 && block.timestamp >= d.transferCutoff) return false;
        return true;
    }

    /// @inheritdoc INodeStayUsageRight
    function getUsageData(uint256 usageRightId)
        external
        view
        tokenExists(usageRightId)
        returns (UsageData memory)
    {
        return _usageData[usageRightId];
    }

    // -----------------------------------------------------------------------
    // ERC-721 転送制限（_update フック）
    // -----------------------------------------------------------------------

    /// @notice 使用権の転送可否をオンチェーンで強制する
    /// @dev ミント（from == address(0)）は無条件許可
    ///      オペレータによる強制転送は許可（lock/cancel などの管理操作向け）
    ///      それ以外は isTransferAllowed のルールに従う
    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);

        if (from != address(0) && auth != operator) {
            // 一般ユーザーの転送：ルール適用
            if (!isTransferAllowed(tokenId)) {
                UsageData storage d = _usageData[tokenId];
                if (!d.transferable) revert NotTransferable();
                if (d.transferCutoff != 0 && block.timestamp >= d.transferCutoff) revert TransferCutoffPassed();
                if (d.transferCount >= d.maxTransferCount) revert MaxTransferCountReached();
                // CHECKED_IN / CONSUMED / CANCELLED の転送試行もここで止まる
                revert InvalidStatus(d.status);
            }
            // 転送回数をインクリメント
            _usageData[tokenId].transferCount++;
            _usageData[tokenId].status = UsageStatus.MINTED;
        }

        return super._update(to, tokenId, auth);
    }
}
