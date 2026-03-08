// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title NodeStay 算力権 NFT
/// @notice 遊休算力の時間的利用権（Compute Right）を ERC-721 として管理する
/// @dev ジョブライフサイクル管理と Pro-Rata 按比例決済をサポートする
contract NodeStayComputeRight is ERC721, Ownable, ReentrancyGuard {

    // -----------------------------------------------------------------------
    // 定数
    // -----------------------------------------------------------------------

    /// @notice プラットフォーム手数料（25%、10000 分の）
    uint256 public constant PLATFORM_FEE_BPS = 2500;

    // -----------------------------------------------------------------------
    // 列挙型
    // -----------------------------------------------------------------------

    /// @notice 算力権のステータス
    enum ComputeStatus {
        ISSUED,       // 発行済み・未使用
        RESERVED,     // ジョブ予約済み
        RUNNING,      // 実行中
        COMPLETED,    // 正常完了
        INTERRUPTED,  // 割り込み中断（Pro-Rata 精算対象）
        FAILED,       // 失敗
        EXPIRED       // 期限切れ
    }

    // -----------------------------------------------------------------------
    // データ構造
    // -----------------------------------------------------------------------

    /// @notice 算力権のオンチェーンデータ
    struct ComputeData {
        bytes32  nodeId;            // keccak256(offchainMachineId)
        uint256  durationSeconds;   // 購入した利用時間（秒）
        uint256  priceJpyc;         // 支払い済み JPYC 量（18 decimals）
        uint256  startedAt;         // 実行開始タイムスタンプ（0 = 未開始）
        uint256  endedAt;           // 実行終了タイムスタンプ（0 = 未終了）
        ComputeStatus status;
    }

    // -----------------------------------------------------------------------
    // 状態変数
    // -----------------------------------------------------------------------

    /// @notice オペレータアドレス（バックエンドサービス）
    address public operator;

    /// @notice 決済トークン（JPYC）
    IERC20 public immutable jpyc;

    /// @notice プラットフォーム手数料受取アドレス
    address public platformFeeRecipient;

    /// @notice 次のトークン ID（1 始まり）
    uint256 public nextTokenId = 1;

    /// @notice tokenId → ComputeData
    mapping(uint256 => ComputeData) private _computeData;

    // -----------------------------------------------------------------------
    // カスタムエラー
    // -----------------------------------------------------------------------

    error NotOperator();
    error ZeroAddress();
    error TokenNotFound();
    error InvalidStatus(ComputeStatus current);
    error ZeroDuration();
    error ZeroPrice();

    // -----------------------------------------------------------------------
    // イベント
    // -----------------------------------------------------------------------

    /// @notice 算力権 mint 時
    event ComputeRightMinted(address indexed to, uint256 indexed tokenId, bytes32 nodeId, uint256 durationSeconds, uint256 priceJpyc);

    /// @notice ジョブ開始時
    event JobStarted(uint256 indexed tokenId, uint256 startedAt);

    /// @notice ジョブ完了時（正常終了）
    event JobCompleted(uint256 indexed tokenId, uint256 endedAt);

    /// @notice ジョブ中断時（Pro-Rata 精算）
    event JobInterrupted(uint256 indexed tokenId, uint256 usedSeconds, uint256 refundJpyc);

    // -----------------------------------------------------------------------
    // 修飾子
    // -----------------------------------------------------------------------

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    modifier tokenExists(uint256 tokenId) {
        if (_ownerOf(tokenId) == address(0)) revert TokenNotFound();
        _;
    }

    // -----------------------------------------------------------------------
    // コンストラクタ
    // -----------------------------------------------------------------------

    /// @param _jpyc JPYC ERC-20 コントラクトアドレス
    /// @param _platformFeeRecipient プラットフォーム手数料受取アドレス
    constructor(address _jpyc, address _platformFeeRecipient)
        ERC721("NodeStay Compute Right", "NSCR")
        Ownable(msg.sender)
    {
        if (_jpyc == address(0) || _platformFeeRecipient == address(0)) revert ZeroAddress();
        jpyc = IERC20(_jpyc);
        platformFeeRecipient = _platformFeeRecipient;
        operator = msg.sender;
    }

    // -----------------------------------------------------------------------
    // オペレータ管理
    // -----------------------------------------------------------------------

    /// @notice オペレータを変更する（Owner のみ）
    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        operator = newOperator;
    }

    /// @notice プラットフォーム手数料受取先を変更する（Owner のみ）
    function setPlatformFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        platformFeeRecipient = newRecipient;
    }

    // -----------------------------------------------------------------------
    // 算力権 mint
    // -----------------------------------------------------------------------

    /// @notice 算力権を mint して購入者に付与する（Operator のみ）
    /// @param to 購入者アドレス
    /// @param nodeId keccak256(offchainMachineId)
    /// @param durationSeconds 購入時間（秒）
    /// @param priceJpyc 支払い JPYC 量
    /// @return tokenId 新規発行したトークン ID
    function mintComputeRight(
        address to,
        bytes32 nodeId,
        uint256 durationSeconds,
        uint256 priceJpyc
    ) external onlyOperator returns (uint256 tokenId) {
        if (durationSeconds == 0) revert ZeroDuration();
        if (priceJpyc == 0) revert ZeroPrice();

        tokenId = nextTokenId++;
        _safeMint(to, tokenId);

        _computeData[tokenId] = ComputeData({
            nodeId:          nodeId,
            durationSeconds: durationSeconds,
            priceJpyc:       priceJpyc,
            startedAt:       0,
            endedAt:         0,
            status:          ComputeStatus.ISSUED
        });

        emit ComputeRightMinted(to, tokenId, nodeId, durationSeconds, priceJpyc);
    }

    // -----------------------------------------------------------------------
    // ジョブライフサイクル
    // -----------------------------------------------------------------------

    /// @notice ジョブを開始する（Operator のみ）
    /// @param tokenId 対象の算力権トークン ID
    function startJob(uint256 tokenId) external onlyOperator tokenExists(tokenId) {
        ComputeData storage data = _computeData[tokenId];
        if (data.status != ComputeStatus.ISSUED && data.status != ComputeStatus.RESERVED) {
            revert InvalidStatus(data.status);
        }
        data.status    = ComputeStatus.RUNNING;
        data.startedAt = block.timestamp;
        emit JobStarted(tokenId, block.timestamp);
    }

    /// @notice ジョブを正常完了する（Operator のみ）
    /// @param tokenId 対象の算力権トークン ID
    function completeJob(uint256 tokenId) external onlyOperator tokenExists(tokenId) nonReentrant {
        ComputeData storage data = _computeData[tokenId];
        if (data.status != ComputeStatus.RUNNING) revert InvalidStatus(data.status);

        data.status  = ComputeStatus.COMPLETED;
        data.endedAt = block.timestamp;

        // プラットフォーム手数料を精算する
        uint256 fee = data.priceJpyc * PLATFORM_FEE_BPS / 10000;
        uint256 nodeOwnerAmount = data.priceJpyc - fee;

        address tokenOwner = ownerOf(tokenId);
        jpyc.transfer(tokenOwner, nodeOwnerAmount);
        jpyc.transfer(platformFeeRecipient, fee);

        emit JobCompleted(tokenId, block.timestamp);
    }

    /// @notice ジョブを中断し Pro-Rata 精算を行う（Operator のみ）
    /// @param tokenId 対象の算力権トークン ID
    /// @param buyer 購入者アドレス（未使用分の返金先）
    function interruptJob(uint256 tokenId, address buyer) external onlyOperator tokenExists(tokenId) nonReentrant {
        ComputeData storage data = _computeData[tokenId];
        if (data.status != ComputeStatus.RUNNING) revert InvalidStatus(data.status);

        data.status  = ComputeStatus.INTERRUPTED;
        data.endedAt = block.timestamp;

        // 使用時間に基づく Pro-Rata 計算
        uint256 usedSeconds = block.timestamp - data.startedAt;
        if (usedSeconds > data.durationSeconds) usedSeconds = data.durationSeconds;

        uint256 usedAmount   = data.priceJpyc * usedSeconds / data.durationSeconds;
        uint256 refundAmount = data.priceJpyc - usedAmount;

        // 使用分のみプラットフォーム手数料を差し引いて精算
        uint256 fee = usedAmount * PLATFORM_FEE_BPS / 10000;
        uint256 nodeOwnerAmount = usedAmount - fee;

        address tokenOwner = ownerOf(tokenId);
        if (nodeOwnerAmount > 0) jpyc.transfer(tokenOwner, nodeOwnerAmount);
        if (fee > 0)             jpyc.transfer(platformFeeRecipient, fee);
        if (refundAmount > 0)    jpyc.transfer(buyer, refundAmount);

        emit JobInterrupted(tokenId, usedSeconds, refundAmount);
    }

    /// @notice ジョブを失敗としてマークし全額返金する（Operator のみ）
    /// @param tokenId 対象の算力権トークン ID
    /// @param buyer 返金先アドレス
    function failJob(uint256 tokenId, address buyer) external onlyOperator tokenExists(tokenId) nonReentrant {
        ComputeData storage data = _computeData[tokenId];
        if (data.status != ComputeStatus.RUNNING && data.status != ComputeStatus.RESERVED) {
            revert InvalidStatus(data.status);
        }
        data.status  = ComputeStatus.FAILED;
        data.endedAt = block.timestamp;

        // 失敗時は全額返金
        jpyc.transfer(buyer, data.priceJpyc);
    }

    // -----------------------------------------------------------------------
    // ビュー関数
    // -----------------------------------------------------------------------

    /// @notice 算力権データを取得する
    function getComputeData(uint256 tokenId) external view tokenExists(tokenId) returns (ComputeData memory) {
        return _computeData[tokenId];
    }
}
