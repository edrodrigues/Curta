'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/lib/store';
import { RequireAdmin } from '@/lib/RequireAdmin';

type Coupon = {
  id: string;
  code: string;
  credits: number;
  max_redemptions: number | null;
  redemptions_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
};

type CouponState = 'ativo' | 'inativo' | 'expirado' | 'esgotado';

const STATE_LABEL: Record<CouponState, string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  expirado: 'Expirado',
  esgotado: 'Esgotado',
};

const STATE_PILL: Record<CouponState, string> = {
  ativo: 'status-pronto',
  inativo: 'status-rascunho',
  expirado: 'status-processando',
  esgotado: 'status-processando',
};

function couponState(c: Coupon): CouponState {
  if (!c.is_active) return 'inativo';
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) return 'expirado';
  if (c.max_redemptions !== null && c.redemptions_count >= c.max_redemptions) return 'esgotado';
  return 'ativo';
}

export default function CuponsPage() {
  return (
    <RequireAdmin>
      <CuponsContent />
    </RequireAdmin>
  );
}

function CuponsContent() {
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState('');
  const [credits, setCredits] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cupons');
      const json = await res.json();
      if (json.ok) setCoupons(json.coupons);
      else toast(json.message || 'Falha ao carregar cupons.');
    } catch {
      toast('Falha ao carregar cupons.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/cupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          credits: Number(credits),
          maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.message || 'Falha ao criar cupom.');
        return;
      }
      setCode('');
      setCredits('');
      setMaxRedemptions('');
      setExpiresAt('');
      toast(`Cupom ${json.coupon.code} criado.`);
      await load();
    } catch {
      setError('Falha ao criar cupom.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: Coupon) {
    try {
      const res = await fetch(`/api/cupons/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !c.is_active }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast(json.message || 'Falha ao atualizar cupom.');
        return;
      }
      toast(c.is_active ? 'Cupom desativado.' : 'Cupom ativado.');
      await load();
    } catch {
      toast('Falha ao atualizar cupom.');
    }
  }

  async function removeCoupon(c: Coupon) {
    if (!window.confirm(`Excluir o cupom ${c.code}? Essa ação não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/cupons/${c.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) {
        toast(json.message || 'Falha ao excluir cupom.');
        return;
      }
      toast('Cupom excluído.');
      await load();
    } catch {
      toast('Falha ao excluir cupom.');
    }
  }

  return (
    <div className="container">
      <div className="dash-top">
        <div>
          <h1>Cupons de crédito</h1>
          <p className="sub">Crie e gerencie cupons que concedem créditos aos usuários.</p>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-row">
            <h3>Cupons existentes</h3>
          </div>
          {loading ? (
            <p className="sub">Carregando…</p>
          ) : coupons.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 0' }}>
              <p>Nenhum cupom criado ainda.</p>
            </div>
          ) : (
            coupons.map((c, i) => {
              const state = couponState(c);
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '0.85rem 0',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div className="mini-title">{c.code}</div>
                    <div className="mini-meta">
                      {c.credits} créditos · {c.redemptions_count}
                      {c.max_redemptions !== null ? `/${c.max_redemptions}` : ''} usos
                      {c.expires_at ? ` · até ${new Date(c.expires_at).toLocaleDateString('pt-BR')}` : ''}
                    </div>
                  </div>
                  <span className={`status-pill ${STATE_PILL[state]}`}>{STATE_LABEL[state]}</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-quiet" onClick={() => toggleActive(c)}>
                      {c.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button className="btn-danger-text" onClick={() => removeCoupon(c)}>
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="card">
          <h3>Novo cupom</h3>
          <form onSubmit={handleCreate} style={{ marginTop: '1rem' }}>
            <label className="field">
              <span className="l">Código</span>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="CURTA10"
                required
              />
            </label>
            <label className="field">
              <span className="l">Créditos</span>
              <input
                type="number"
                min={1}
                step={1}
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="l">Limite de usos (opcional)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="Ilimitado"
              />
            </label>
            <label className="field">
              <span className="l">Validade (opcional)</span>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </label>
            {error && <p className="hint is-error">{error}</p>}
            <button className="btn btn-primary btn-block" type="submit" disabled={saving}>
              {saving ? 'Criando…' : 'Criar cupom'}
            </button>
          </form>
        </div>
      </div>

      <Link href="/painel" className="btn btn-ghost" style={{ marginBottom: '3rem', display: 'inline-flex' }}>
        Voltar ao painel
      </Link>
    </div>
  );
}
