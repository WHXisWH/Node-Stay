// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title NodeStay 収益権トークン（ERC-1155）
/// @notice マシンの収益分配権を ERC-1155 として発行・管理する
/// @dev 各 programId が ERC-1155 の token ID に対応する
///      保有量に応じた比例配分配当を JPYC で受け取れる
contract NodeStayRevenueRight is ERC1155, Ownable, ReentrancyGuard {

    // -----------------------------------------------------------------------
    // データ構造
    // -----------------------------------------------------------------------

    /// @notice 収益プログラムの設定
    struct RevenueProgram {
        bytes32  nodeId;           // keccak256(offchainMachineId)
        uint256  totalSupply;      // 総発行量（比例配分の分母）
        uint256  startAt;          // プログラム開始タイムスタンプ
        uint256  endAt;            // プログラム終了タイムスタンプ
        string   settlementCycle;  // "DAILY" / "WEEKLY" / "MONTHLY"
        bool     active;
    }

    /// @notice 収益配当サイクルの記録
    struct Allocation {
        uint256 programId;
        uint256 totalAmountJpyc;      // 今サイクルの総配当額
        uint256 periodStart;
        uint256 periodEnd;
        bytes32 allocationTxHash;
        bool    distributed;          // 配当済みフラグ
    }

    // -----------------------------------------------------------------------
    // 状態変数
    // -----------------------------------------------------------------------

    /// @notice オペレータアドレス（バックエンドサービス）
    address public operator;

    /// @notice 決済トークン（JPYC）
    IERC20 public immutable jpyc;

    /// @notice 次のプログラム ID（= ERC-1155 token ID, 1 始まり）
    uint256 public nextProgramId = 1;

    /// @notice programId → RevenueProgram
    mapping(uint256 => RevenueProgram) public programs;

    /// @notice allocationId → Allocation
    mapping(uint256 => Allocation) public allocations;

    /// @notice 次の配当 ID
    uint256 public nextAllocationId = 1;

    /// @notice holder => programId => allocationId => claimed（クレーム済みフラグ）
    mapping(address => mapping(uint256 => mapping(uint256 => bool))) public claimed;

    // -----------------------------------------------------------------------
    // イベント
    // -----------------------------------------------------------------------

    /// @notice 収益プログラム作成時
    event ProgramCreated(uint256 indexed programId, bytes32 nodeId, uint256 totalSupply);

    /// @notice 配当記録時
    event AllocationRecorded(uint256 indexed allocationId, uint256 indexed programId, uint256 totalAmountJpyc);

    /// @notice 収益 claim 時
    event Claimed(address indexed holder, uint256 indexed programId, uint256 indexed allocationId, uint256 amountJpyc);

    // -----------------------------------------------------------------------
    // カスタムエラー
    // -----------------------------------------------------------------------

    error NotOperator();
    error ZeroAddress();
    error ProgramNotFound();
    error ProgramInactive();
    error AlreadyClaimed();
    error AllocationNotFound();
    error NothingToClaim();
    error ZeroSupply();

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

    /// @param _jpyc JPYC ERC-20 コントラクトアドレス
    constructor(address _jpyc) ERC1155("") Ownable(msg.sender) {
        if (_jpyc == address(0)) revert ZeroAddress();
        jpyc = IERC20(_jpyc);
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

    // -----------------------------------------------------------------------
    // 収益プログラム管理
    // -----------------------------------------------------------------------

    /// @notice 収益プログラムを作成し、収益権を投資家に mint する（Operator のみ）
    /// @param nodeId keccak256(offchainMachineId)
    /// @param investors 投資家アドレス配列
    /// @param amounts 各投資家への配布量（totalSupply = sum(amounts)）
    /// @param startAt プログラム開始タイムスタンプ
    /// @param endAt プログラム終了タイムスタンプ
    /// @param settlementCycle 配当サイクル（"DAILY" / "WEEKLY" / "MONTHLY"）
    /// @return programId 新規プログラム ID（ERC-1155 token ID）
    function createProgram(
        bytes32 nodeId,
        address[] calldata investors,
        uint256[] calldata amounts,
        uint256 startAt,
        uint256 endAt,
        string calldata settlementCycle
    ) external onlyOperator returns (uint256 programId) {
        require(investors.length == amounts.length, "investors/amounts mismatch");
        require(investors.length > 0, "empty investors");

        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
        if (total == 0) revert ZeroSupply();

        programId = nextProgramId++;
        programs[programId] = RevenueProgram({
            nodeId:          nodeId,
            totalSupply:     total,
            startAt:         startAt,
            endAt:           endAt,
            settlementCycle: settlementCycle,
            active:          true
        });

        // 各投資家に ERC-1155 トークンを mint
        for (uint256 i = 0; i < investors.length; i++) {
            if (amounts[i] > 0) {
                _mint(investors[i], programId, amounts[i], "");
            }
        }

        emit ProgramCreated(programId, nodeId, total);
    }

    // -----------------------------------------------------------------------
    // 配当記録
    // -----------------------------------------------------------------------

    /// @notice 配当サイクルを記録し JPYC をデポジットする（Operator のみ）
    /// @param programId 対象プログラム ID
    /// @param totalAmountJpyc 今サイクルの総配当額
    /// @param periodStart 配当対象期間の開始タイムスタンプ
    /// @param periodEnd 配当対象期間の終了タイムスタンプ
    /// @return allocationId 新規配当 ID
    function recordAllocation(
        uint256 programId,
        uint256 totalAmountJpyc,
        uint256 periodStart,
        uint256 periodEnd
    ) external onlyOperator returns (uint256 allocationId) {
        RevenueProgram storage prog = programs[programId];
        if (prog.totalSupply == 0) revert ProgramNotFound();
        if (!prog.active) revert ProgramInactive();

        // JPYC をオペレータからこのコントラクトに移転
        jpyc.transferFrom(msg.sender, address(this), totalAmountJpyc);

        allocationId = nextAllocationId++;
        allocations[allocationId] = Allocation({
            programId:        programId,
            totalAmountJpyc:  totalAmountJpyc,
            periodStart:      periodStart,
            periodEnd:        periodEnd,
            allocationTxHash: bytes32(0),
            distributed:      false
        });

        emit AllocationRecorded(allocationId, programId, totalAmountJpyc);
    }

    // -----------------------------------------------------------------------
    // 収益 Claim
    // -----------------------------------------------------------------------

    /// @notice 保有量に応じた収益を claim する
    /// @param programId 対象プログラム ID
    /// @param allocationId 対象配当 ID
    function claim(uint256 programId, uint256 allocationId) external nonReentrant {
        Allocation storage alloc = allocations[allocationId];
        if (alloc.totalAmountJpyc == 0) revert AllocationNotFound();
        if (alloc.programId != programId) revert AllocationNotFound();

        if (claimed[msg.sender][programId][allocationId]) revert AlreadyClaimed();

        // 保有量に応じた比例配分を計算（totalSupply に対する保有比率）
        uint256 holderBalance = balanceOf(msg.sender, programId);
        if (holderBalance == 0) revert NothingToClaim();

        RevenueProgram storage prog = programs[programId];
        uint256 holderAmount = alloc.totalAmountJpyc * holderBalance / prog.totalSupply;
        if (holderAmount == 0) revert NothingToClaim();

        claimed[msg.sender][programId][allocationId] = true;
        jpyc.transfer(msg.sender, holderAmount);

        emit Claimed(msg.sender, programId, allocationId, holderAmount);
    }

    // -----------------------------------------------------------------------
    // ビュー関数
    // -----------------------------------------------------------------------

    /// @notice 未 claim の収益額を計算する
    /// @param holder 対象保有者アドレス
    /// @param programId 対象プログラム ID
    /// @param allocationId 対象配当 ID
    /// @return amount claim 可能な JPYC 量（既に claim 済みの場合は 0）
    function claimableAmount(
        address holder,
        uint256 programId,
        uint256 allocationId
    ) external view returns (uint256 amount) {
        if (claimed[holder][programId][allocationId]) return 0;

        Allocation storage alloc = allocations[allocationId];
        if (alloc.programId != programId || alloc.totalAmountJpyc == 0) return 0;

        uint256 holderBalance = balanceOf(holder, programId);
        if (holderBalance == 0) return 0;

        RevenueProgram storage prog = programs[programId];
        return alloc.totalAmountJpyc * holderBalance / prog.totalSupply;
    }
}
