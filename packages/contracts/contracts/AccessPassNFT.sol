// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AccessPassNFT
/// @notice ネットカフェ利用権を表すNFTコントラクト
/// @dev ERC721を継承し、利用権の発行・消費・譲渡クールダウンを管理する
contract AccessPassNFT is ERC721, Ownable {
    // -----------------------------------------------------------------------
    // 定数
    // -----------------------------------------------------------------------

    /// @notice 譲渡クールダウン期間（マネロン防止）
    uint256 public constant TRANSFER_COOLDOWN = 24 hours;

    // -----------------------------------------------------------------------
    // 状態変数
    // -----------------------------------------------------------------------

    /// @notice オペレータアドレス（通常はバックエンドサービス）
    address public operator;

    /// @notice 次のトークンID（1始まり）
    uint256 public nextTokenId = 1;

    /// @notice パスの詳細データ構造体
    struct PassData {
        uint256 planId;           // 料金プランID
        uint256 venueId;          // 対象店舗ID（0なら複数店舗共通）
        uint256 remainingMinutes; // 残り利用時間（分）
        uint256 expiresAt;        // 有効期限（UNIXタイムスタンプ）
        bool    isActive;         // 有効フラグ
        bool    transferable;     // 譲渡可能フラグ（月額プランは false）
    }

    /// @notice tokenId → PassData のマッピング
    mapping(uint256 => PassData) public passes;

    /// @notice tokenId → 最終譲渡タイムスタンプ（クールダウン計算用）
    mapping(uint256 => uint256) public lastTransferTime;

    // -----------------------------------------------------------------------
    // カスタムエラー
    // -----------------------------------------------------------------------

    error NotOperator();
    error ZeroAddress();
    error PassExpired();
    error PassInactive();
    error NotTransferable();
    error CooldownActive(uint256 availableAt);
    error InsufficientRemainingMinutes();
    error InvalidDuration();

    // -----------------------------------------------------------------------
    // イベント
    // -----------------------------------------------------------------------

    event OperatorUpdated(address indexed operator);

    /// @notice パスがミントされた時に発行
    event PassMinted(
        uint256 indexed tokenId,
        address indexed to,
        uint256 planId,
        uint256 venueId,
        uint256 durationMinutes,
        uint256 expiresAt,
        bool    transferable
    );

    /// @notice パスが消費（使用）された時に発行
    event PassConsumed(
        uint256 indexed tokenId,
        uint256 usedMinutes,
        uint256 remainingMinutes
    );

    /// @notice パスが一時停止された時に発行（紛争・不正対応）
    event PassSuspended(uint256 indexed tokenId);

    /// @notice パスが再有効化された時に発行
    event PassReactivated(uint256 indexed tokenId);

    // -----------------------------------------------------------------------
    // コンストラクタ
    // -----------------------------------------------------------------------

    constructor(string memory name_, string memory symbol_)
        ERC721(name_, symbol_)
        Ownable(msg.sender)
    {}

    // -----------------------------------------------------------------------
    // 修飾子
    // -----------------------------------------------------------------------

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    // -----------------------------------------------------------------------
    // 管理関数（Owner）
    // -----------------------------------------------------------------------

    /// @notice オペレータアドレスを設定する
    /// @param operator_ 新しいオペレータアドレス
    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorUpdated(operator_);
    }

    // -----------------------------------------------------------------------
    // オペレータ関数
    // -----------------------------------------------------------------------

    /// @notice 利用権NFTを発行する
    /// @param to            受取アドレス
    /// @param planId        料金プランID
    /// @param venueId       対象店舗ID（0=複数店舗共通）
    /// @param durationMinutes 基本利用時間（分）
    /// @param expiresAt     有効期限（UNIXタイムスタンプ）
    /// @param transferable_ 譲渡可能フラグ
    /// @return tokenId      発行されたトークンID
    function mint(
        address to,
        uint256 planId,
        uint256 venueId,
        uint256 durationMinutes,
        uint256 expiresAt,
        bool    transferable_
    ) external onlyOperator returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        if (durationMinutes == 0) revert InvalidDuration();
        if (expiresAt <= block.timestamp) revert PassExpired();

        tokenId = nextTokenId++;
        _safeMint(to, tokenId);

        passes[tokenId] = PassData({
            planId:           planId,
            venueId:          venueId,
            remainingMinutes: durationMinutes,
            expiresAt:        expiresAt,
            isActive:         true,
            transferable:     transferable_
        });

        emit PassMinted(tokenId, to, planId, venueId, durationMinutes, expiresAt, transferable_);
    }

    /// @notice パスを消費する（チェックアウト時にオペレータが呼び出す）
    /// @param tokenId     対象トークンID
    /// @param usedMinutes 実際に使用した時間（分）
    function consumePass(uint256 tokenId, uint256 usedMinutes) external onlyOperator {
        PassData storage pass = passes[tokenId];

        if (!pass.isActive)                    revert PassInactive();
        if (block.timestamp >= pass.expiresAt) revert PassExpired();
        if (usedMinutes > pass.remainingMinutes) revert InsufficientRemainingMinutes();

        unchecked {
            pass.remainingMinutes -= usedMinutes;
        }

        // 残り0分になったら無効化
        if (pass.remainingMinutes == 0) {
            pass.isActive = false;
        }

        emit PassConsumed(tokenId, usedMinutes, pass.remainingMinutes);
    }

    /// @notice パスを一時停止する（紛争・不正使用対応）
    /// @param tokenId 対象トークンID
    function suspendPass(uint256 tokenId) external onlyOperator {
        passes[tokenId].isActive = false;
        emit PassSuspended(tokenId);
    }

    /// @notice パスを再有効化する
    /// @param tokenId 対象トークンID
    function reactivatePass(uint256 tokenId) external onlyOperator {
        passes[tokenId].isActive = true;
        emit PassReactivated(tokenId);
    }

    // -----------------------------------------------------------------------
    // 内部関数
    // -----------------------------------------------------------------------

    /// @notice ERC721転送フック：譲渡可否・クールダウンをチェックする
    /// @dev _update はミント・転送・バーン全てで呼ばれる
    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);

        // ミント時（from == address(0)）はスキップ
        if (from != address(0)) {
            PassData storage pass = passes[tokenId];

            // 譲渡不可チェック
            if (!pass.transferable) revert NotTransferable();

            // クールダウンチェック
            uint256 availableAt = lastTransferTime[tokenId] + TRANSFER_COOLDOWN;
            if (block.timestamp < availableAt) revert CooldownActive(availableAt);

            // 譲渡時刻を記録
            lastTransferTime[tokenId] = block.timestamp;
        }

        return super._update(to, tokenId, auth);
    }

    // -----------------------------------------------------------------------
    // ビュー関数
    // -----------------------------------------------------------------------

    /// @notice パスデータを取得する
    /// @param tokenId 対象トークンID
    function getPass(uint256 tokenId) external view returns (PassData memory) {
        return passes[tokenId];
    }

    /// @notice パスが現在有効かどうかを確認する
    /// @param tokenId 対象トークンID
    /// @return true = 有効・利用可能
    function isPassValid(uint256 tokenId) external view returns (bool) {
        PassData storage pass = passes[tokenId];
        return pass.isActive
            && block.timestamp < pass.expiresAt
            && pass.remainingMinutes > 0;
    }
}
