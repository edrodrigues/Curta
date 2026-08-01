'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/lib/store';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function EntrarPage() {
  return (
    <Suspense fallback={null}>
      <EntrarForm />
    </Suspense>
  );
}

function EntrarForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const url = searchParams.get('url');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('senha') as HTMLInputElement).value;
    setLoading(true);
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast(error.message);
        setLoading(false);
        return;
      }
      toast('Bem-vindo(a) de volta!');
      router.push(url ? '/novo?url=' + encodeURIComponent(url) : '/painel');
    } catch {
      toast('Falha de conexão. Tente novamente.');
      setLoading(false);
    }
  }

  const criarHref = url ? '/criar-conta?url=' + encodeURIComponent(url) : '/criar-conta';

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-switch">
          <Link href="/entrar" className="is-active">Entrar</Link>
          <Link href={criarHref}>Criar conta</Link>
        </div>
        <h2>Bem-vindo de volta</h2>
        <p className="sub">Entre para continuar seus projetos.</p>
        <form onSubmit={onSubmit}>
          <label className="field">
            <span className="l">E-mail</span>
            <input type="email" name="email" placeholder="voce@email.com" required />
          </label>
          <label className="field">
            <span className="l">Senha</span>
            <input type="password" name="senha" placeholder="••••••••" required />
          </label>
          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}