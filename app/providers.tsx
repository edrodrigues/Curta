'use client';

import { StoreProvider, ToastProvider } from '@/lib/store';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <StoreProvider>{children}</StoreProvider>
    </ToastProvider>
  );
}