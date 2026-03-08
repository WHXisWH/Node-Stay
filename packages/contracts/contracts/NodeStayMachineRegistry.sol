// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {INodeStayMachineRegistry} from "./interfaces/INodeStayMachineRegistry.sol";
import {MachineStatus} from "./interfaces/NodeStayTypes.sol";

/// @title NodeStay 機器レジストリ
/// @notice 現実機器（Machine Root）を ERC-721 としてオンチェーン登録・管理する
/// @dev machineId = keccak256(venueIdHash, registrantAddress, specHash, nonce) で生成
contract NodeStayMachineRegistry is ERC721, Ownable, INodeStayMachineRegistry {

    // -----------------------------------------------------------------------
    // 状態変数
    // -----------------------------------------------------------------------

    /// @notice オペレータアドレス（バックエンドサービス）
    address public operator;

    /// @notice 次のトークンID（1始まり）
    uint256 public nextTokenId = 1;

    /// @notice 登録ノンス（同一オーナーが同じ specHash で複数登録できるように）
    mapping(address => uint256) public registrationNonce;

    /// @notice machineId → MachineData
    mapping(bytes32 => MachineData) private _machines;

    /// @notice machineId → tokenId
    mapping(bytes32 => uint256) private _machineToToken;

    /// @notice tokenId → machineId
    mapping(uint256 => bytes32) private _tokenToMachine;

    // -----------------------------------------------------------------------
    // カスタムエラー
    // -----------------------------------------------------------------------

    error NotOperator();
    error ZeroAddress();
    error MachineNotFound();
    error MachineAlreadyExists();
    error NotMachineOwner();

    // -----------------------------------------------------------------------
    // 修飾子
    // -----------------------------------------------------------------------

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    modifier machineExists(bytes32 machineId) {
        if (!exists(machineId)) revert MachineNotFound();
        _;
    }

    // -----------------------------------------------------------------------
    // コンストラクタ
    // -----------------------------------------------------------------------

    constructor() ERC721("NodeStay Machine Registry", "NSM") Ownable(msg.sender) {}

    // -----------------------------------------------------------------------
    // 管理関数（Owner）
    // -----------------------------------------------------------------------

    /// @notice オペレータアドレスを設定する
    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
    }

    // -----------------------------------------------------------------------
    // INodeStayMachineRegistry 実装
    // -----------------------------------------------------------------------

    /// @inheritdoc INodeStayMachineRegistry
    function registerMachine(
        bytes32 venueIdHash,
        uint8   machineClass,
        bytes32 specHash,
        string  calldata metadataURI
    ) external onlyOperator returns (bytes32 machineId) {
        address registrant = msg.sender;

        // machineId を決定論的に生成（同一パラメータでの重複登録はノンスで防止）
        uint256 nonce = registrationNonce[registrant]++;
        machineId = keccak256(abi.encodePacked(
            venueIdHash,
            registrant,
            specHash,
            nonce
        ));

        if (_machineToToken[machineId] != 0) revert MachineAlreadyExists();

        uint256 tokenId = nextTokenId++;
        _safeMint(registrant, tokenId);

        _machines[machineId] = MachineData({
            machineId:   machineId,
            venueIdHash: venueIdHash,
            owner:       registrant,
            machineClass: machineClass,
            status:      MachineStatus.REGISTERED,
            specHash:    specHash,
            metadataURI: metadataURI
        });

        _machineToToken[machineId] = tokenId;
        _tokenToMachine[tokenId]   = machineId;

        emit MachineRegistered(machineId, registrant, tokenId);
    }

    /// @inheritdoc INodeStayMachineRegistry
    function updateMachineStatus(
        bytes32 machineId,
        MachineStatus status
    ) external onlyOperator machineExists(machineId) {
        _machines[machineId].status = status;
        emit MachineStatusUpdated(machineId, status);
    }

    /// @inheritdoc INodeStayMachineRegistry
    function updateMachineMetadata(
        bytes32 machineId,
        string calldata metadataURI
    ) external onlyOperator machineExists(machineId) {
        _machines[machineId].metadataURI = metadataURI;
        emit MachineMetadataUpdated(machineId, metadataURI);
    }

    /// @inheritdoc INodeStayMachineRegistry
    /// @dev 機器ルートの所有権移転はオペレータのみ可能（通常の ERC-721 転送は不可）
    function transferMachineRoot(
        bytes32 machineId,
        address newOwner
    ) external onlyOperator machineExists(machineId) {
        if (newOwner == address(0)) revert ZeroAddress();

        MachineData storage machine = _machines[machineId];
        address previousOwner = machine.owner;
        machine.owner = newOwner;

        uint256 tokenId = _machineToToken[machineId];
        _transfer(previousOwner, newOwner, tokenId);

        emit MachineOwnerUpdated(machineId, newOwner);
    }

    /// @inheritdoc INodeStayMachineRegistry
    function getMachine(bytes32 machineId) external view returns (MachineData memory) {
        return _machines[machineId];
    }

    /// @inheritdoc INodeStayMachineRegistry
    function exists(bytes32 machineId) public view returns (bool) {
        return _machineToToken[machineId] != 0;
    }

    // -----------------------------------------------------------------------
    // ビュー関数
    // -----------------------------------------------------------------------

    /// @notice tokenId から machineId を取得する
    function getMachineIdByToken(uint256 tokenId) external view returns (bytes32) {
        return _tokenToMachine[tokenId];
    }

    /// @notice machineId から tokenId を取得する
    function getTokenIdByMachine(bytes32 machineId) external view returns (uint256) {
        return _machineToToken[machineId];
    }

    // -----------------------------------------------------------------------
    // ERC-721 転送制限
    // -----------------------------------------------------------------------

    /// @notice 機器ルートは通常の ERC-721 転送を禁止（operatorOnly の transferMachineRoot を使用）
    /// @dev msg.sender でチェックする（_transfer 内部呼び出しでは auth=address(0) になるため）
    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        // ミント（from == address(0)）はスキップ
        // それ以外はオペレータが msg.sender であることを要求
        if (from != address(0) && msg.sender != operator) {
            revert NotOperator();
        }
        return super._update(to, tokenId, auth);
    }
}
