// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ComputeMarket
/// @notice 遊休算力マーケットプレイス
/// @dev ノードID（bytes32）をオンチェーン管理し、ジョブのライフサイクルと自動収益分配を処理する
contract ComputeMarket is Ownable, ReentrancyGuard {
    // -----------------------------------------------------------------------
    // 定数
    // -----------------------------------------------------------------------

    /// @notice プラットフォーム手数料（25%）
    uint256 public constant PLATFORM_FEE_BPS = 250;

    /// @notice 手数料計算の分母（1000 = 100%）
    uint256 public constant FEE_DENOMINATOR = 1000;

    // -----------------------------------------------------------------------
    // 状態変数
    // -----------------------------------------------------------------------

    /// @notice 決済トークン（JPYC）
    IERC20 public immutable token;

    /// @notice オペレータアドレス（バックエンドサービス）
    address public operator;

    /// @notice プラットフォーム手数料の受取アドレス
    address public platformFeeRecipient;

    /// @notice 次のジョブID（1始まり）
    uint256 public nextJobId = 1;

    /// @notice ジョブステータスの列挙型
    enum JobStatus {
        PENDING,    // 依頼済み・マッチング待ち
        ASSIGNED,   // ノードにアサイン済み
        RUNNING,    // 実行中
        COMPLETED,  // 完了（収益分配済み）
        FAILED,     // 失敗（全額返金済み）
        CANCELLED   // キャンセル（全額返金済み）
    }

    /// @notice ノードの詳細データ構造体
    struct NodeData {
        address venueOwner;         // ノード所有店舗のアドレス
        uint256 pricePerHourMinor;  // 1時間あたりの料金（JPYCマイナー単位）
        uint256 minBookingHours;    // 最小予約時間
        uint256 maxBookingHours;    // 最大予約時間
        bool    active;             // 受付中フラグ
    }

    /// @notice ジョブの詳細データ構造体
    struct JobData {
        bytes32 nodeId;         // 対象ノードID
        address requester;      // 依頼者アドレス
        uint256 depositMinor;   // エスクロー金額（JPYCマイナー単位）
        uint256 estimatedHours; // 予約時間数
        uint256 startedAt;      // 実行開始タイムスタンプ（0=未開始）
        uint256 endedAt;        // 終了タイムスタンプ（0=未終了）
        JobStatus status;       // 現在のステータス
        bytes32 resultHash;     // 成果物ハッシュ（完了時のみ）
    }

    /// @notice nodeId → NodeData のマッピング
    mapping(bytes32 => NodeData) public nodes;

    /// @notice jobId → JobData のマッピング
    mapping(uint256 => JobData) public jobs;

    /// @notice 登録済みノードIDの一覧（列挙用）
    bytes32[] public nodeIds;

    // -----------------------------------------------------------------------
    // カスタムエラー
    // -----------------------------------------------------------------------

    error NotOperator();
    error ZeroAddress();
    error NodeNotFound();
    error NodeAlreadyExists();
    error NodeNotActive();
    error InvalidBookingHours();
    error InvalidPrice();
    error JobNotFound();
    error InvalidJobTransition();
    error NotRequesterOrOperator();

    // -----------------------------------------------------------------------
    // イベント
    // -----------------------------------------------------------------------

    event OperatorUpdated(address indexed operator);
    event PlatformFeeRecipientUpdated(address indexed recipient);

    /// @notice ノードが登録された時に発行
    event NodeRegistered(
        bytes32 indexed nodeId,
        address indexed venueOwner,
        uint256 pricePerHourMinor
    );

    /// @notice ノード情報が更新された時に発行
    event NodeUpdated(bytes32 indexed nodeId);

    /// @notice ノードが無効化された時に発行
    event NodeDeactivated(bytes32 indexed nodeId);

    /// @notice ノードが有効化された時に発行
    event NodeActivated(bytes32 indexed nodeId);

    /// @notice ジョブが依頼された時に発行
    event JobSubmitted(
        uint256 indexed jobId,
        bytes32 indexed nodeId,
        address indexed requester,
        uint256 depositMinor
    );

    /// @notice ジョブがアサインされた時に発行
    event JobAssigned(uint256 indexed jobId);

    /// @notice ジョブが開始された時に発行
    event JobStarted(uint256 indexed jobId, uint256 startedAt);

    /// @notice ジョブが完了し収益が分配された時に発行
    event JobCompleted(
        uint256 indexed jobId,
        bytes32 resultHash,
        uint256 venueAmount,
        uint256 platformAmount
    );

    /// @notice ジョブが失敗し返金された時に発行
    event JobFailed(uint256 indexed jobId, uint256 refundAmount);

    /// @notice ジョブがキャンセルされ返金された時に発行
    event JobCancelled(uint256 indexed jobId, uint256 refundAmount);

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

    constructor(address token_, address platformFeeRecipient_) Ownable(msg.sender) {
        if (token_ == address(0)) revert ZeroAddress();
        if (platformFeeRecipient_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        platformFeeRecipient = platformFeeRecipient_;
    }

    // -----------------------------------------------------------------------
    // 管理関数（Owner）
    // -----------------------------------------------------------------------

    /// @notice オペレータアドレスを設定する
    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorUpdated(operator_);
    }

    /// @notice プラットフォーム手数料受取アドレスを設定する
    function setPlatformFeeRecipient(address recipient_) external onlyOwner {
        if (recipient_ == address(0)) revert ZeroAddress();
        platformFeeRecipient = recipient_;
        emit PlatformFeeRecipientUpdated(recipient_);
    }

    // -----------------------------------------------------------------------
    // ノード管理関数（Operator）
    // -----------------------------------------------------------------------

    /// @notice ノードを新規登録する
    /// @param nodeId       keccak256ハッシュ（オフチェーンIDのオンチェーン表現）
    /// @param venueOwner   ノード所有店舗のアドレス
    /// @param pricePerHourMinor 1時間あたりの料金（JPYCマイナー単位）
    /// @param minBookingHours  最小予約時間数
    /// @param maxBookingHours  最大予約時間数
    function registerNode(
        bytes32 nodeId,
        address venueOwner,
        uint256 pricePerHourMinor,
        uint256 minBookingHours,
        uint256 maxBookingHours
    ) external onlyOperator {
        if (nodes[nodeId].venueOwner != address(0)) revert NodeAlreadyExists();
        if (venueOwner == address(0)) revert ZeroAddress();
        if (pricePerHourMinor == 0) revert InvalidPrice();
        if (minBookingHours == 0 || minBookingHours > maxBookingHours) revert InvalidBookingHours();

        nodes[nodeId] = NodeData({
            venueOwner:        venueOwner,
            pricePerHourMinor: pricePerHourMinor,
            minBookingHours:   minBookingHours,
            maxBookingHours:   maxBookingHours,
            active:            true
        });
        nodeIds.push(nodeId);

        emit NodeRegistered(nodeId, venueOwner, pricePerHourMinor);
    }

    /// @notice ノードの料金・時間設定を更新する
    function updateNode(
        bytes32 nodeId,
        uint256 pricePerHourMinor,
        uint256 minBookingHours,
        uint256 maxBookingHours
    ) external onlyOperator {
        NodeData storage node = nodes[nodeId];
        if (node.venueOwner == address(0)) revert NodeNotFound();
        if (pricePerHourMinor == 0) revert InvalidPrice();
        if (minBookingHours == 0 || minBookingHours > maxBookingHours) revert InvalidBookingHours();

        node.pricePerHourMinor = pricePerHourMinor;
        node.minBookingHours   = minBookingHours;
        node.maxBookingHours   = maxBookingHours;

        emit NodeUpdated(nodeId);
    }

    /// @notice ノードを無効化する（新規ジョブ受付停止）
    function deactivateNode(bytes32 nodeId) external onlyOperator {
        if (nodes[nodeId].venueOwner == address(0)) revert NodeNotFound();
        nodes[nodeId].active = false;
        emit NodeDeactivated(nodeId);
    }

    /// @notice ノードを有効化する（新規ジョブ受付再開）
    function activateNode(bytes32 nodeId) external onlyOperator {
        if (nodes[nodeId].venueOwner == address(0)) revert NodeNotFound();
        nodes[nodeId].active = true;
        emit NodeActivated(nodeId);
    }

    // -----------------------------------------------------------------------
    // ジョブライフサイクル関数
    // -----------------------------------------------------------------------

    /// @notice ジョブを依頼する（JPYCをエスクローに預け入れ）
    /// @param nodeId        対象ノードID
    /// @param estimatedHours 予約時間数
    /// @return jobId         発行されたジョブID
    function submitJob(
        bytes32 nodeId,
        uint256 estimatedHours
    ) external nonReentrant returns (uint256 jobId) {
        NodeData storage node = nodes[nodeId];
        if (node.venueOwner == address(0)) revert NodeNotFound();
        if (!node.active) revert NodeNotActive();
        if (
            estimatedHours < node.minBookingHours ||
            estimatedHours > node.maxBookingHours
        ) revert InvalidBookingHours();

        uint256 depositMinor = node.pricePerHourMinor * estimatedHours;
        bool ok = token.transferFrom(msg.sender, address(this), depositMinor);
        require(ok, "transferFrom failed");

        jobId = nextJobId++;
        jobs[jobId] = JobData({
            nodeId:         nodeId,
            requester:      msg.sender,
            depositMinor:   depositMinor,
            estimatedHours: estimatedHours,
            startedAt:      0,
            endedAt:        0,
            status:         JobStatus.PENDING,
            resultHash:     bytes32(0)
        });

        emit JobSubmitted(jobId, nodeId, msg.sender, depositMinor);
    }

    /// @notice ジョブをノードにアサインする（PENDING → ASSIGNED）
    function assignJob(uint256 jobId) external onlyOperator {
        JobData storage job = jobs[jobId];
        if (job.requester == address(0)) revert JobNotFound();
        if (job.status != JobStatus.PENDING) revert InvalidJobTransition();

        job.status = JobStatus.ASSIGNED;
        emit JobAssigned(jobId);
    }

    /// @notice ジョブの実行を開始する（ASSIGNED → RUNNING）
    function startJob(uint256 jobId) external onlyOperator {
        JobData storage job = jobs[jobId];
        if (job.requester == address(0)) revert JobNotFound();
        if (job.status != JobStatus.ASSIGNED) revert InvalidJobTransition();

        job.status    = JobStatus.RUNNING;
        job.startedAt = block.timestamp;
        emit JobStarted(jobId, block.timestamp);
    }

    /// @notice ジョブを完了し収益を自動分配する（RUNNING → COMPLETED）
    /// @dev 店舗75% / プラットフォーム25%
    function completeJob(uint256 jobId, bytes32 resultHash) external nonReentrant onlyOperator {
        JobData storage job = jobs[jobId];
        if (job.requester == address(0)) revert JobNotFound();
        if (job.status != JobStatus.RUNNING) revert InvalidJobTransition();

        job.status     = JobStatus.COMPLETED;
        job.endedAt    = block.timestamp;
        job.resultHash = resultHash;

        uint256 deposit      = job.depositMinor;
        uint256 platformFee  = (deposit * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
        uint256 venueAmount  = deposit - platformFee;

        address venueOwner = nodes[job.nodeId].venueOwner;

        bool ok1 = token.transfer(venueOwner, venueAmount);
        require(ok1, "venue transfer failed");

        bool ok2 = token.transfer(platformFeeRecipient, platformFee);
        require(ok2, "platform transfer failed");

        emit JobCompleted(jobId, resultHash, venueAmount, platformFee);
    }

    /// @notice ジョブ失敗を記録し全額返金する（ASSIGNED/RUNNING → FAILED）
    function failJob(uint256 jobId) external nonReentrant onlyOperator {
        JobData storage job = jobs[jobId];
        if (job.requester == address(0)) revert JobNotFound();
        if (job.status != JobStatus.RUNNING && job.status != JobStatus.ASSIGNED)
            revert InvalidJobTransition();

        uint256 refund    = job.depositMinor;
        address requester = job.requester;

        job.status  = JobStatus.FAILED;
        job.endedAt = block.timestamp;

        bool ok = token.transfer(requester, refund);
        require(ok, "refund failed");

        emit JobFailed(jobId, refund);
    }

    /// @notice ジョブをキャンセルし全額返金する（PENDING/ASSIGNED → CANCELLED）
    /// @dev 依頼者本人またはオペレータのみキャンセル可
    function cancelJob(uint256 jobId) external nonReentrant {
        JobData storage job = jobs[jobId];
        if (job.requester == address(0)) revert JobNotFound();
        if (msg.sender != job.requester && msg.sender != operator)
            revert NotRequesterOrOperator();
        if (job.status != JobStatus.PENDING && job.status != JobStatus.ASSIGNED)
            revert InvalidJobTransition();

        uint256 refund    = job.depositMinor;
        address requester = job.requester;

        job.status = JobStatus.CANCELLED;

        bool ok = token.transfer(requester, refund);
        require(ok, "refund failed");

        emit JobCancelled(jobId, refund);
    }

    // -----------------------------------------------------------------------
    // ビュー関数
    // -----------------------------------------------------------------------

    /// @notice ノードデータを取得する
    function getNode(bytes32 nodeId) external view returns (NodeData memory) {
        return nodes[nodeId];
    }

    /// @notice ジョブデータを取得する
    function getJob(uint256 jobId) external view returns (JobData memory) {
        return jobs[jobId];
    }

    /// @notice 登録済みノード数を返す
    function getNodeCount() external view returns (uint256) {
        return nodeIds.length;
    }
}
