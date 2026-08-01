'use client';

import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'curta_demo_theme_v1';

function applyTheme(t: string | null) {
  if (t === 'dark' || t === 'light') {
    document.documentElement.setAttribute('data-theme', t);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function useTheme() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(THEME_KEY) : null;
    applyTheme(stored);
  }, []);

  const toggle = useCallback(() => {
    if (typeof document === 'undefined') return;
    const current = document.documentElement.getAttribute('data-theme');
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effectiveDark = current ? current === 'dark' : prefersDark;
    const next = effectiveDark ? 'light' : 'dark';
    window.localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }, []);

  return { mounted, toggle };
}