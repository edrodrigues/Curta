'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStore, useToast } from '@/lib/store';
import { useTheme } from '@/lib/theme';

export function Tape() {
  const pathname = usePathname();
  const router = useRouter();
  const store = useStore();
  const { toast } = useToast();
  const { toggle } = useTheme();

  const onGuestRoutes = pathname === '/' || pathname?.startsWith('/entrar') || pathname?.startsWith('/criar-conta');
  const showGuestHeader = !store.loggedIn || onGuestRoutes;

  function handleReset(e: React.MouseEvent) {
    e.preventDefault();
    store.reset();
    toast('Demonstração reiniciada.');
    router.push('/');
  }

  return (
    <header className="tape">
      <div className="tape-inner">
        <Link className="brand" href="/" aria-label="Ir para a página inicial">
          <span className="dot" />
          <span className="word">Curta</span>
        </Link>
        <nav className="tape-nav" style={{ display: showGuestHeader ? 'flex' : 'none' }}>
          <Link href="/#como-funciona" className="navlink">Como funciona</Link>
          <Link href="/#precos" className="navlink">Preços</Link>
        </nav>

        <div className="tape-spacer" />

        {showGuestHeader ? (
          <div className="tape-actions">
            <button className="icon-btn" aria-label="Alternar tema" title="Alternar tema claro/escuro" onClick={toggle}>◐</button>
            <Link className="btn btn-ghost" href="/entrar">Entrar</Link>
            <Link className="btn btn-primary" href="/criar-conta">Criar conta</Link>
          </div>
        ) : (
          <div className="tape-actions">
            <button className="icon-btn" aria-label="Alternar tema" title="Alternar tema claro/escuro" onClick={toggle}>◐</button>
            <Link className="credit-pill" href="/creditos" title="Comprar mais créditos">
              <span>◆</span> <b>{store.credits}</b> créditos
            </Link>
            <Link
              className="avatar"
              href="/painel"
              title="Painel"
              aria-label="Painel"
            >
              {(store.user?.nome || 'V').charAt(0).toUpperCase()}
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}