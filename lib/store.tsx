'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Project, StoreState } from './types';
import { genId } from './types';

const STORAGE_KEY = 'curta_demo_state_v1';

function defaultState(): StoreState {
  return { loggedIn: false, user: null, credits: 0, projects: [] };
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
  login: (nome: string, email: string) => void;
  logout: () => void;
  reset: () => void;
  addCredits: (n: number) => void;
  chargeCredits: (n: number) => void;
  addProject: (p: Project) => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => void;
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

  const login = useCallback((nome: string, email: string) => {
    setState((prev) => {
      const bonus = prev.credits === 0 && prev.projects.length === 0 ? 2 : prev.credits;
      return {
        loggedIn: true,
        user: { nome: nome || 'Você', email: email || '' },
        credits: bonus,
        projects: prev.projects,
      };
    });
  }, []);

  const logout = useCallback(() => {
    setState((prev) => ({ ...prev, loggedIn: false, user: null }));
  }, []);

  const reset = useCallback(() => {
    setState(defaultState());
  }, []);

  const addCredits = useCallback((n: number) => {
    setState((prev) => ({ ...prev, credits: prev.credits + n }));
  }, []);

  const chargeCredits = useCallback((n: number) => {
    setState((prev) => ({ ...prev, credits: Math.max(0, prev.credits - n) }));
  }, []);

  const addProject = useCallback((p: Project) => {
    setState((prev) => ({ ...prev, projects: [p, ...prev.projects] }));
  }, []);

  const deleteProject = useCallback((id: string) => {
    setState((prev) => ({ ...prev, projects: prev.projects.filter((p) => p.id !== id) }));
  }, []);

  const duplicateProject = useCallback((id: string) => {
    setState((prev) => {
      const src = prev.projects.find((p) => p.id === id);
      if (!src) return prev;
      const copy: Project = {
        ...src,
        id: genId(),
        titulo: src.titulo + ' (cópia)',
        status: 'rascunho',
      };
      return { ...prev, projects: [copy, ...prev.projects] };
    });
  }, []);

  const value = useMemo<StoreContextValue>(
    () => ({
      ...state,
      hydrated,
      login,
      logout,
      reset,
      addCredits,
      chargeCredits,
      addProject,
      deleteProject,
      duplicateProject,
    }),
    [state, hydrated, login, logout, reset, addCredits, chargeCredits, addProject, deleteProject, duplicateProject]
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