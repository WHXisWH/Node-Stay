import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import RootLayout from './layout';

// next/navigation をモック化（Header が usePathname を使用するため）
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// next/link をモック化
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// API クライアントをモック化（Header が getBalance を呼ぶため）
vi.mock('../services/nodestay', () => ({
  createNodeStayClient: () => ({
    getBalance: vi.fn().mockResolvedValue({ balanceMinor: 0, depositHeldMinor: 0 }),
  }),
}));

describe('RootLayout', () => {
  it('子要素がレンダリングされる', () => {
    render(
      <RootLayout>
        <div>テストコンテンツ</div>
      </RootLayout>,
    );
    expect(screen.getByText('テストコンテンツ')).toBeInTheDocument();
  });

  it('ナビゲーションリンクが表示される', () => {
    render(
      <RootLayout>
        <div>content</div>
      </RootLayout>,
    );
    // ホームリンクが存在することを確認
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
  });
});
