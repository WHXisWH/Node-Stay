'use client';

import { useCallback, useEffect, useState } from 'react';

export interface UseUiStateReturn {
  mobileOpen: boolean;
  scrolled: boolean;
  loginModalOpen: boolean;
  /** アカウントドロップダウン（認証済みヘッダー右側）の開閉状態 */
  accountMenuOpen: boolean;
  closeMobile: () => void;
  toggleMobile: () => void;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  toggleAccountMenu: () => void;
  closeAccountMenu: () => void;
}

export function useUiState(): UseUiStateReturn {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const closeMobile      = useCallback(() => setMobileOpen(false), []);
  const toggleMobile     = useCallback(() => setMobileOpen((v) => !v), []);
  const openLoginModal   = useCallback(() => {
    setLoginModalOpen(true);
    setMobileOpen(false);
    setAccountMenuOpen(false);
  }, []);
  const closeLoginModal  = useCallback(() => setLoginModalOpen(false), []);
  const toggleAccountMenu = useCallback(() => setAccountMenuOpen((v) => !v), []);
  const closeAccountMenu  = useCallback(() => setAccountMenuOpen(false), []);

  return {
    mobileOpen,
    scrolled,
    loginModalOpen,
    accountMenuOpen,
    closeMobile,
    toggleMobile,
    openLoginModal,
    closeLoginModal,
    toggleAccountMenu,
    closeAccountMenu,
  };
}
