'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore, useToast } from '@/lib/store';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function CriarContaPage() {
  return (
    <Suspense fallback={null}>
      <CriarContaForm />
    </Suspense>
  );
}

function CriarContaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const store = useStore();
  const { toast } = useToast();
  const url = searchParams.get('url');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const nome = (form.elements.namedItem('nome') as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('senha') as HTMLInputElement).value;
    setLoading(true);
    try {
      const supabase = createSupabaseBrowser();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: nome } },
      });
      if (error) {
        toast(error.message);
        setLoading(false);
        return;
      }
      store.addCredits(2);
      if (data.user && !data.session) {
        toast('Conta criada! Verifique seu e-mail para confirmar.');
        setLoading(false);
        return;
      }
      toast('Bem-vindo(a), ' + (nome || 'Você') + '!');
      router.push(url ? '/novo?url=' + encodeURIComponent(url) : '/painel');
    } catch {
      toast('Falha de conexão. Tente novamente.');
      setLoading(false);
    }
  }

  const entrarHref = url ? '/entrar?url=' + encodeURIComponent(url) : '/entrar';

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-switch">
          <Link href={entrarHref}>Entrar</Link>
          <Link href="/criar-conta" className="is-active">Criar conta</Link>
        </div>
        <h2>Criar sua conta</h2>
        <p className="sub">Ganhe 2 créditos grátis para começar.</p>
        <form onSubmit={onSubmit}>
          <label className="field">
            <span className="l">Nome</span>
            <input type="text" name="nome" placeholder="Seu nome" required />
          </label>
          <label className="field">
            <span className="l">E-mail</span>
            <input type="email" name="email" placeholder="voce@email.com" required />
          </label>
          <label className="field">
            <span className="l">Senha</span>
            <input type="password" name="senha" placeholder="••••••••" required />
          </label>
          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? 'Criando conta…' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  );
}