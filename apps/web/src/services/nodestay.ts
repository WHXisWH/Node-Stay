import { NodeStayClient } from '@nodestay/api-client';
import { getApiBaseUrl } from './config';
import { useUserStore } from '../stores/user.store';

/**
 * JWT を Authorization ヘッダーに自動付与する fetchImpl を生成する。
 * Zustand ストアから最新の jwt を毎リクエスト時に読み取るため、
 * クライアントインスタンスを使い回しても常に最新トークンを使用できる。
 */
function createAuthenticatedFetch(): typeof fetch {
  return async (input, init) => {
    const jwt = useUserStore.getState().jwt;
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (jwt) {
      headers['authorization'] = `Bearer ${jwt}`;
    }
    try {
      return await fetch(input, { ...init, headers });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isNetworkError =
        e instanceof TypeError ||
        /fetch|network|load|接続|failed to fetch/i.test(msg);
      if (isNetworkError) {
        throw new Error('ネットワークに接続できません。接続状況とログイン状態をご確認ください。');
      }
      throw e;
    }
  };
}

export function createNodeStayClient() {
  return new NodeStayClient({
    baseUrl:   getApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    fetchImpl: createAuthenticatedFetch(),
  });
}
