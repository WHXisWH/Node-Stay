/**
 * Store 仕様（SPEC §9、TODO M11）
 *
 * ルール:
 * - Service がデータ取得と変換を行い、結果を Store に書き込む。Controller は Store を読み取り専用で扱う。
 * - State 構造は各 store で「業務データ + loading + error」を持つ。
 * - Service 向け setter（setVenues / setLoading / setError / setNodes / setJobs など）を公開する。
 * - Controller は getState() / useSelector / getter（getVenues() / isLoading() など）で読み取る。
 * - Service はリクエスト前に setLoading(true), setError(null)、完了時に setLoading(false)、失敗時に setError(message) を設定する。
 */

export type StoreLoading = boolean;
export type StoreError = string | null;
