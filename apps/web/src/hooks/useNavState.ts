'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface UseNavStateReturn {
  isNavItemActive: (href: string) => boolean;
}

export function useNavState(): UseNavStateReturn {
  const pathname = usePathname();
  const isNavItemActive = useCallback((href: string) => isActive(pathname, href), [pathname]);
  return { isNavItemActive };
}
