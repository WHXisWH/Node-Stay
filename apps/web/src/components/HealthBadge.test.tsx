import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthBadge } from './HealthBadge';

// HealthService をモック化（HealthBadge は HealthService.check を呼ぶ）
vi.mock('../services/health.service');

describe('HealthBadge', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('最初に「API 確認中」が表示される', async () => {
    const { HealthService } = await import('../services/health.service');
    vi.mocked(HealthService.check).mockReturnValue(new Promise(() => {})); // 永遠に解決しない

    render(<HealthBadge />);
    expect(screen.getByText(/確認中/)).toBeInTheDocument();
  });

  it('API 正常時に「正常」バッジが表示される', async () => {
    const { HealthService } = await import('../services/health.service');
    vi.mocked(HealthService.check).mockResolvedValue({ ok: true });

    render(<HealthBadge />);
    expect(await screen.findByText(/正常/)).toBeInTheDocument();
  });

  it('API エラー時に「エラー」バッジが表示される', async () => {
    const { HealthService } = await import('../services/health.service');
    vi.mocked(HealthService.check).mockRejectedValue(new Error('接続失敗'));

    render(<HealthBadge />);
    expect(await screen.findByText(/エラー/)).toBeInTheDocument();
  });
});
