'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { StoreState } from './types';

const STORAGE_KEY = 'curta_demo_state_v1';

function defaultState(): StoreState {
  return { credits: 0 };
}

function loadState(): StoreState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<StoreState>;
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

type StoreContextValue = StoreState & {
  hydrated: boolean;
  reset: () => void;
  addCredits: (n: number) => void;
  chargeCredits: (n: number) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoreState>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota errors */
    }
  }, [state, hydrated]);

  const reset = useCallback(() => {
    setState(defaultState());
  }, []);

  const addCredits = useCallback((n: number) => {
    setState((prev) => ({ ...prev, credits: prev.credits + n }));
  }, []);

  const chargeCredits = useCallback((n: number) => {
    setState((prev) => ({ ...prev, credits: Math.max(0, prev.credits - n) }));
  }, []);

  const value = useMemo<StoreContextValue>(
    () => ({
      ...state,
      hydrated,
      reset,
      addCredits,
      chargeCredits,
    }),
    [state, hydrated, reset, addCredits, chargeCredits]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

/* ---------- toast ---------- */
type Toast = { id: number; msg: string };
type ToastContextValue = { toast: (msg: string) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const toast = useCallback((msg: string) => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, msg }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2900);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span className="d" />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}