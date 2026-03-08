// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MachineStatus} from "./NodeStayTypes.sol";

/// @title NodeStay 機器レジストリ インターフェース
/// @notice 現実機器のルートアセット（Machine Root）を ERC-721 として管理する
interface INodeStayMachineRegistry {

    /// @notice オンチェーン機器データ
    struct MachineData {
        bytes32 machineId;    // keccak256(venueIdHash, localSerial, specHash, nonce)
        bytes32 venueIdHash;  // 所属店舗の識別ハッシュ
        address owner;        // オーナーウォレット
        uint8   machineClass; // 機器クラス（0=STANDARD, 1=GPU, 2=CPU, 3=PREMIUM）
        MachineStatus status; // 機器状態
        bytes32 specHash;     // ハードウェアスペックのハッシュアンカー
        string  metadataURI;  // オフチェーンメタデータ URI
    }

    event MachineRegistered(bytes32 indexed machineId, address indexed owner, uint256 indexed tokenId);
    event MachineStatusUpdated(bytes32 indexed machineId, MachineStatus status);
    event MachineMetadataUpdated(bytes32 indexed machineId, string metadataURI);
    event MachineOwnerUpdated(bytes32 indexed machineId, address indexed newOwner);

    /// @notice 機器をオンチェーン登録する（ERC-721 mint）
    function registerMachine(
        bytes32 venueIdHash,
        uint8   machineClass,
        bytes32 specHash,
        string  calldata metadataURI
    ) external returns (bytes32 machineId);

    /// @notice 機器の状態を更新する
    function updateMachineStatus(bytes32 machineId, MachineStatus status) external;

    /// @notice 機器のメタデータ URI を更新する
    function updateMachineMetadata(bytes32 machineId, string calldata metadataURI) external;

    /// @notice 機器ルートの所有権を移転する
    function transferMachineRoot(bytes32 machineId, address newOwner) external;

    /// @notice 機器データを取得する
    function getMachine(bytes32 machineId) external view returns (MachineData memory);

    /// @notice 機器が登録済みかどうかを確認する
    function exists(bytes32 machineId) external view returns (bool);
}
