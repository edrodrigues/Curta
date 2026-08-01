'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store';
import { useAuth, getDisplayName } from '@/lib/auth';
import { useProjects } from '@/lib/use-projects';
import { statusLabel } from '@/lib/types';
import { CanvasThumb } from '@/components/Canvas';
import { RequireAuth } from '@/lib/RequireAuth';

export default function PainelPage() {
  return (
    <RequireAuth>
      <PainelContent />
    </RequireAuth>
  );
}

function PainelContent() {
  const store = useStore();
  const { user } = useAuth();
  const { projects } = useProjects();
  const recent = projects.slice(0, 3);
  const firstName = getDisplayName(user).split(' ')[0];

  return (
    <div className="container">
      <div className="dash-top">
        <div>
          <h1>Olá, {firstName || 'visitante'}</h1>
          <p className="sub">O que vamos criar hoje?</p>
        </div>
        <div className="dash-actions">
          <Link className="btn btn-quiet" href="/projetos">Ver projetos</Link>
          <Link className="btn btn-primary" href="/novo">Novo projeto</Link>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-row">
            <h3>Projetos recentes</h3>
            <Link className="btn-danger-text" href="/projetos">ver todos</Link>
          </div>
          <div>
            {recent.map((p) => (
              <div className="mini-project" key={p.id}>
                <div className="mini-thumb"><CanvasThumb seedText={p.titulo} /></div>
                <div>
                  <div className="mini-title">{p.titulo}</div>
                  <div className="mini-meta">{p.duracao}s · {p.estiloNome}</div>
                </div>
                <span className={`status-pill status-${p.status}`}>{statusLabel(p.status)}</span>
              </div>
            ))}
          </div>
          {recent.length === 0 && (
            <div className="empty-state" style={{ padding: '2rem 0' }}>
              <p>Você ainda não criou nenhum vídeo.</p>
              <Link className="btn btn-primary" href="/novo" style={{ marginTop: '1rem', display: 'inline-flex' }}>Criar o primeiro</Link>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <div className="card">
            <p className="eyebrow">Seu saldo</p>
            <div className="credit-balance">
              <span className="n">{store.credits}</span>
              <span className="u">créditos</span>
            </div>
            <p className="credit-hint">
              ≈ {Math.floor(store.credits)} vídeo(s) de 30s ou {Math.floor(store.credits / 2)} de 60s
            </p>
            <Link className="btn btn-quiet btn-block" href="/creditos" style={{ marginTop: '1rem', display: 'inline-flex' }}>Comprar créditos</Link>
          </div>
          <div className="card tip-card">
            <p className="eyebrow">Dica</p>
            <p style={{ marginTop: '0.5rem', fontSize: 'var(--step--1)' }}>
              Roteiros curtos e diretos rendem narrações mais naturais. Uma frase por ideia funciona melhor do que parágrafos longos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}