'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore, useToast } from '@/lib/store';

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
  const store = useStore();
  const { toast } = useToast();
  const url = searchParams.get('url');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    const nome = store.user?.nome || email.split('@')[0] || 'Você';
    store.login(nome, email);
    toast('Bem-vindo(a), ' + nome + '!');
    router.push(url ? '/novo?url=' + encodeURIComponent(url) : '/painel');
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
          <button className="btn btn-primary btn-block" type="submit">Entrar</button>
        </form>
        <p className="auth-note">Demonstração: qualquer e-mail e senha são aceitos. Nenhum dado é enviado a um servidor.</p>
      </div>
    </div>
  );
}