'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useStore, useToast } from '@/lib/store';
import { PACKAGES } from '@/lib/types';
import { RequireAuth } from '@/lib/RequireAuth';

export default function CreditosPage() {
  return (
    <RequireAuth>
      <CreditosContent />
    </RequireAuth>
  );
}

type Pending = { slug: string; credits: number; price: number };

function CreditosContent() {
  const store = useStore();
  const { toast } = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function openBuy(p: Pending) {
    setPending(p);
    setOpen(true);
  }

  function confirmBuy() {
    if (!pending) return;
    store.addCredits(pending.credits);
    toast('+' + pending.credits + ' créditos adicionados (simulação).');
    setOpen(false);
  }

  return (
    <div className="container">
      <div className="dash-top">
        <div>
          <h1>Comprar créditos</h1>
          <p className="sub">1 crédito equivale a R$ 25 em criações. Compre em lote e economize.</p>
        </div>
      </div>
      <div className="store-grid">
        {PACKAGES.map((p) => (
          <div className={`pack-card${p.featured ? ' is-featured' : ''}`} key={p.slug}>
            {p.featured && <span className="pack-badge">Mais popular</span>}
            <p className="pack-name">{p.slug}</p>
            <p className="pack-credits">{p.credits} <small>créditos</small></p>
            <p className="pack-price">R$ {p.price}</p>
            <p className="pack-save">Economize R$ {p.save}</p>
            <button
              className={`btn ${p.featured ? 'btn-primary' : 'btn-quiet'}`}
              onClick={() => openBuy({ slug: p.slug, credits: p.credits, price: p.price })}
            >
              Comprar
            </button>
          </div>
        ))}
      </div>
      <p className="footer-note" style={{ paddingBottom: '3rem' }}>Ambiente de demonstração — nenhuma cobrança real é feita ao comprar créditos aqui.</p>

      <Link href="/painel" className="btn btn-ghost" style={{ marginBottom: '3rem', display: 'inline-flex' }}>Voltar ao painel</Link>

      {open && pending && (
        <div className="overlay is-open" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="modal">
            <h2>Confirmar compra</h2>
            <p className="sub">Revise os detalhes do pacote de créditos.</p>
            <div>
              <div className="confirm-row"><span>Pacote</span><span>{pending.slug.charAt(0).toUpperCase() + pending.slug.slice(1)}</span></div>
              <div className="confirm-row"><span>Créditos</span><span>{pending.credits} créditos</span></div>
              <div className="confirm-row total"><span>Total</span><span>R$ {pending.price}</span></div>
            </div>
            <button className="btn btn-primary btn-block" style={{ marginTop: '1.5rem' }} onClick={confirmBuy}>Confirmar compra simulada</button>
            <button className="btn btn-ghost btn-block" style={{ marginTop: '0.6rem' }} onClick={() => setOpen(false)}>Cancelar</button>
            <p className="modal-note">Ambiente de demonstração — nenhum pagamento real é processado. Em produção, esta etapa usaria um gateway de pagamento real.</p>
          </div>
        </div>
      )}
    </div>
  );
}