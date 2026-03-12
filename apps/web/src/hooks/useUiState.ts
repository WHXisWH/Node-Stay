'use client';

import { useCallback, useEffect, useState } from 'react';

export interface UseUiStateReturn {
  mobileOpen: boolean;
  scrolled: boolean;
  loginModalOpen: boolean;
  closeMobile: () => void;
  toggleMobile: () => void;
  openLoginModal: () => void;
  closeLoginModal: () => void;
}

export function useUiState(): UseUiStateReturn {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const toggleMobile = useCallback(() => setMobileOpen((v) => !v), []);
  const openLoginModal = useCallback(() => {
    setLoginModalOpen(true);
    setMobileOpen(false);
  }, []);
  const closeLoginModal = useCallback(() => setLoginModalOpen(false), []);

  return {
    mobileOpen,
    scrolled,
    loginModalOpen,
    closeMobile,
    toggleMobile,
    openLoginModal,
    closeLoginModal,
  };
}
