import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Page from './page';

// next/link をモック化
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

describe('Page', () => {
  it('ホームページのコンテンツが表示される', () => {
    render(<Page />);
    // getAllByText で複数要素にマッチ可能にする
    const elements = screen.getAllByText(/ネットカフェを/);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('店舗を探すリンクが存在する', () => {
    render(<Page />);
    expect(screen.getAllByText(/店舗/).length).toBeGreaterThan(0);
  });
});
