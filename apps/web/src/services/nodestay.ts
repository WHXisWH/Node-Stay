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
    return fetch(input, { ...init, headers });
  };
}

export function createNodeStayClient() {
  return new NodeStayClient({
    baseUrl:   getApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    fetchImpl: createAuthenticatedFetch(),
  });
}
