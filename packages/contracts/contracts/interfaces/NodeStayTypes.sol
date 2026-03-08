// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title NodeStay 共有型定義
/// @notice MachineFi プロトコル全体で使用する enum を一元管理する

// 機器ルートアセットの状態
enum MachineStatus {
    REGISTERED,     // 登録済み（未アクティブ）
    ACTIVE,         // 稼働中
    PAUSED,         // 一時停止
    MAINTENANCE,    // メンテナンス中
    DECOMMISSIONED  // 廃止済み
}

// 使用権の状態
enum UsageStatus {
    MINTED,      // 発行済み（購入完了）
    LISTED,      // 二次市場に出品中
    LOCKED,      // ロック中
    CHECKED_IN,  // 使用中（チェックイン済み）
    CONSUMED,    // 消費済み（チェックアウト完了）
    EXPIRED,     // 期限切れ
    CANCELLED    // キャンセル済み
}

// 算力権の状態
enum ComputeStatus {
    ISSUED,      // 発行済み
    LISTED,      // 出品中
    RESERVED,    // 予約済み
    RUNNING,     // 実行中
    COMPLETED,   // 完了
    INTERRUPTED, // 中断（物理ユーザー優先）
    FAILED,      // 失敗
    EXPIRED      // 期限切れ
}

// 収益権の状態（Phase 3）
enum RevenueStatus {
    ISSUED,   // 発行済み
    ACTIVE,   // 有効
    PAUSED,   // 一時停止
    EXPIRED,  // 期限切れ
    REDEEMED  // 償還済み
}

// 収益権の対象範囲（Phase 3）
enum RevenueScope {
    USAGE_ONLY,   // 使用収益のみ
    COMPUTE_ONLY, // 算力収益のみ
    ALL           // 全収益
}
