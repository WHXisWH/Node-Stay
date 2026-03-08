// MachineFi ドメインモデル
// 機器資産（Machine Asset）の三市場：Usage / Compute / Revenue

// 基礎プリミティブ
export * from './money';
export * from './idempotency';
export * from './identity';

// アセット層
export * from './machine';       // 機器ルートアセット
export * from './machineSlot';   // 時間スロット占有管理（二重売り防止）

// 権利層
export * from './usageRight';    // 使用権（Usage Right）
export * from './compute';       // 算力権・コンピュートジョブ（Compute Right）
export * from './revenueRight';  // 収益権（Revenue Right）- Phase 3

// 場（Market）
export * from './marketplace';   // マーケットプレイス出品

// 店舗・オペレーション
export * from './venue';         // 店舗（Venue）
export * from './session';       // 使用セッション（チェックイン〜チェックアウト）

// 決済・台帳
export * from './ledger';        // 台帳エントリー
export * from './settlement';    // 結算（三方分配）

// リスク・コンプライアンス
export * from './dispute';       // 異議申立
