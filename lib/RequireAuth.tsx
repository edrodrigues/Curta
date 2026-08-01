'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { loggedIn, hydrated } = useStore();

  useEffect(() => {
    if (hydrated && !loggedIn) {
      router.replace('/entrar');
    }
  }, [hydrated, loggedIn, router]);

  if (!hydrated || !loggedIn) return null;
  return <>{children}</>;
}