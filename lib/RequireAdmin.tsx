'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ADMIN_EMAIL } from '@/lib/admin';

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/entrar');
    } else if (user.email !== ADMIN_EMAIL) {
      router.replace('/painel');
    }
  }, [loading, user, router]);

  if (loading || !user || user.email !== ADMIN_EMAIL) return null;
  return <>{children}</>;
}
