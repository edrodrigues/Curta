'use client';

import { useEffect, useState } from 'react';
import { KineticPreview } from '@/components/Canvas';
import {
  emptyBrief,
  genId,
  matchStyle,
  matchTrack,
  TRACKS,
  type Brief,
  type Project,
  type RoteiroOutput,
  type WizardData,
} from '@/lib/types';
import { useStore, useToast } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/lib/RequireAuth';

const WIZ_STEPS: { key: string; label: string }[] = [
  { key: 'duracao', label: 'Duração' },
  { key: 'link', label: 'Link' },
  { key: 'brief', label: 'Brief' },
  { key: 'gerando', label: 'Gerando' },
  { key: 'roteiro', label: 'Roteiro' },
  { key: 'preview-video', label: 'Vídeo' },
  { key: 'preview-audio', label: 'Áudio' },
  { key: 'exportar', label: 'Exportar' },
];

const GEN_STAGES = [
  'Sintetizando narração (ElevenLabs via Monid)',
  'Compondo trilha sonora',
  'Renderizando cenas animadas',
  'Finalizando arquivo de vídeo',
];

const BRIEF_FIELDS: { key: keyof Brief; label: string; placeholder: string; area?: boolean }[] = [
  { key: 'produto', label: 'Produto/Marca', placeholder: 'Ex.: Curta' },
  { key: 'publico_alvo', label: 'Público-alvo', placeholder: 'Ex.: Pequenos empresários 25-45 anos' },
  { key: 'objetivo', label: 'Objetivo', placeholder: 'Ex.: conversão, awareness, explicação' },
  { key: 'tom', label: 'Tom de voz', placeholder: 'Ex.: jovem e descontraído' },
  { key: 'idioma', label: 'Idioma da narração', placeholder: 'Ex.: pt-BR, en-US' },
  { key: 'cta', label: 'CTA e link/destino', placeholder: 'Ex.: Acesse curta.app agora' },
  { key: 'estilo_visual', label: 'Estilo visual de animação', placeholder: 'Ex.: motion graphics 2D flat' },
  { key: 'referencias', label: 'Referências/restrições', placeholder: 'Ex.: cores da marca, coisas a evitar', area: true },
];

const initialWiz: WizardData = {
  link: '',
  duration: null,
  brief: { ...emptyBrief },
  roteiro: null,
};

type Stage = 'idle' | 'running' | 'done';

function slug(s: string): string {
  return (
    (s || 'video')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'video'
  );
}

function buildSrt(project: Project): string {
  const sentences = (project.roteiro || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  const list = sentences.length ? sentences : [project.roteiro || ''];
  const totalMs = project.duracao * 1000;
  const per = Math.floor(totalMs / list.length);
  const pad = (n: string | number, len: number) => {
    let s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  };
  const fmt = (ms: number) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const rem = ms % 1000;
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(rem, 3)}`;
  };
  return list
    .map((s, i) => {
      const startMs = i * per;
      const endMs = Math.min(totalMs, (i + 1) * per - 200);
      return `${i + 1}\n${fmt(startMs)} --> ${fmt(endMs)}\n${s.trim()}\n\n`;
    })
    .join('');
}

function buildSummary(project: Project): string {
  return [
    'CURTA — Resumo do projeto',
    '==========================',
    'Título: ' + project.titulo,
    'Duração: ' + project.duracao + 's',
    'Estilo de narração: ' + project.estiloNome,
    'Trilha sonora: ' + project.trilhaNome,
    'Status: ' + (project.status === 'pronto' ? 'Pronto' : project.status),
    'Criado em: ' + project.createdAt,
    '',
    'Roteiro (narração):',
    project.roteiro,
    '',
    'Roteiro técnico (tabela):',
    project.tabela_md || '(não disponível)',
    '',
    '— Gerado no Curta.',
  ].join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdownTable(md: string): string {
  if (!md) return '';
  const lines = md.split('\n').filter((l) => l.trim().length > 0);
  const tableRows = lines.filter((l) => /^\s*\|.*\|\s*$/.test(l));
  if (tableRows.length < 2) {
    return '<pre class="roteiro-md-fallback">' + escapeHtml(md) + '</pre>';
  }
  const rows = tableRows.map((l) =>
    l
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim())
  );
  const header = rows[0];
  const body = rows.slice(2);
  const ths = header.map((h) => '<th>' + escapeHtml(h) + '</th>').join('');
  const trs = body
    .map((r) => {
      const tds = r.map((c) => '<td>' + escapeHtml(c) + '</td>').join('');
      return '<tr>' + tds + '</tr>';
    })
    .join('');
  return (
    '<table class="roteiro-table"><thead><tr>' +
    ths +
    '</tr></thead><tbody>' +
    trs +
    '</tbody></table>'
  );
}

export default function NovoPage() {
  return (
    <RequireAuth>
      <div className="container wizard-shell">
        <WizardShell />
      </div>
    </RequireAuth>
  );
}

function WizardShell() {
  const router = useRouter();
  const store = useStore();
  const { toast } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [wiz, setWiz] = useState<WizardData>(initialWiz);
  const [stage, setStage] = useState<Stage>('idle');
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastProject, setLastProject] = useState<Project | null>(null);

  const key = WIZ_STEPS[stepIndex].key;

  function goToStep(i: number) {
    setStage('idle');
    setProgress(0);
    setStepIndex(Math.max(0, Math.min(WIZ_STEPS.length - 1, i)));
  }

  function validateStep(): boolean {
    if (key === 'duracao' && !wiz.duration) {
      toast('Escolha uma duração para continuar.');
      return false;
    }
    if (key === 'brief') {
      const b = wiz.brief;
      if (!b.produto.trim() || !b.cta.trim()) {
        toast('Preencha ao menos Produto/Marca e CTA antes de gerar o roteiro.');
        return false;
      }
    }
    if (key === 'roteiro' && (!wiz.roteiro || !wiz.roteiro.narracao_texto)) {
      toast('Gere o roteiro antes de avançar.');
      return false;
    }
    return true;
  }

  function goNext() {
    if (!validateStep()) return;
    if (key === 'brief') {
      setStage('idle');
      setGenerating(false);
      setProgress(0);
      setWiz((w) => ({ ...w, roteiro: null }));
      goToStep(stepIndex + 1);
      return;
    }
    if (stepIndex < WIZ_STEPS.length - 1) goToStep(stepIndex + 1);
  }
  function goBack() {
    if (stepIndex > 0) goToStep(stepIndex - 1);
  }

  async function analyzeLink() {
    const raw = (document.getElementById('input-link') as HTMLInputElement).value.trim();
    if (!raw) {
      toast('Cole um link para analisar, ou pule para preencher o brief manualmente.');
      return;
    }
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    } catch {
      toast('Link inválido. Confira o endereço e tente novamente.');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.toString(),
          durationSeconds: wiz.duration ?? 30,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.brief) {
        toast(data?.message || 'Não foi possível analisar o site.');
        setAnalyzing(false);
        return;
      }
      const brief: Brief = { ...emptyBrief, ...data.brief };
      setWiz((w) => ({ ...w, link: url.toString(), brief }));
      toast('Brief extraído do link. Revise e ajuste antes de gerar.');
      goToStep(WIZ_STEPS.findIndex((s) => s.key === 'brief'));
    } catch {
      toast('Falha de conexão ao analisar o site.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function runRoteiroGeneration() {
    if (generating) return;
    setGenerating(true);
    setStage('running');
    setProgress(0);
    let pct = 0;
    const tick = window.setInterval(() => {
      pct = Math.min(90, pct + 8 + Math.random() * 6);
      setProgress(Math.round(pct));
    }, 350);
    try {
      const res = await fetch('/api/roteiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: wiz.brief,
          durationSeconds: wiz.duration ?? 30,
        }),
      });
      const data = await res.json();
      window.clearInterval(tick);
      if (!res.ok || !data.ok || !data.roteiro) {
        toast(data?.message || 'Falha ao gerar roteiro.');
        setStage('idle');
        setGenerating(false);
        return;
      }
      const roteiro: RoteiroOutput = data.roteiro;
      setWiz((w) => ({ ...w, roteiro }));
      setProgress(100);
      setStage('done');
      toast('Roteiro gerado.');
      window.setTimeout(() => {
        setGenerating(false);
        goToStep(WIZ_STEPS.findIndex((s) => s.key === 'roteiro'));
      }, 500);
    } catch {
      window.clearInterval(tick);
      toast('Falha de conexão ao gerar roteiro.');
      setStage('idle');
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (key === 'gerando' && !generating && stage !== 'done' && stage !== 'running') {
      void runRoteiroGeneration();
    }
    if (key !== 'gerando' && stage === 'running') {
      setStage('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function startGeneration() {
    const cost = wiz.duration === 60 ? 2 : 1;
    if (store.credits < cost) {
      toast('Créditos insuficientes. Compre mais créditos para continuar.');
      router.push('/creditos');
      return;
    }
    setStage('running');
    setProgress(0);
    let s = 0;
    const tick = () => {
      s += 1;
      setProgress(Math.round((s / GEN_STAGES.length) * 100));
      if (s < GEN_STAGES.length) {
        window.setTimeout(tick, 650 + Math.random() * 400);
      } else {
        finishGeneration(cost);
      }
    };
    window.setTimeout(tick, 700);
  }

  function finishGeneration(cost: number) {
    const roteiro = wiz.roteiro;
    if (!roteiro) {
      toast('Roteiro ausente. Volte e gere antes de finalizar.');
      setStage('idle');
      return;
    }
    const styleObj = matchStyle(roteiro.voz.estilo);
    const trilhaNome = matchTrack(roteiro.trilha_mood);
    const project: Project = {
      id: genId(),
      titulo: wiz.brief.produto || 'Vídeo sem título',
      roteiro: roteiro.narracao_texto,
      tabela_md: roteiro.tabela_md,
      duracao: wiz.duration || 30,
      estiloId: styleObj.id,
      estiloNome: styleObj.nome,
      trilhaNome,
      status: 'pronto',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    store.chargeCredits(cost);
    store.addProject(project);
    setLastProject(project);
    setStage('done');
    toast('Vídeo gerado com sucesso!');
  }

  function download(filename: string, text: string) {
    if (typeof window === 'undefined') return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Download iniciado: ' + filename);
  }

  function resetWizard() {
    setWiz(initialWiz);
    setLastProject(null);
    setStage('idle');
    setGenerating(false);
    setProgress(0);
    setStepIndex(0);
  }

  function copyToClipboard(text: string, label: string) {
    if (typeof window === 'undefined' || !text) return;
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('Copiado: ' + label);
      } catch {
        toast('Não foi possível copiar. Selecione e use Ctrl+C.');
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast('Copiado: ' + label),
        fallback
      );
    } else {
      fallback();
    }
  }

  const eyebrowText = `Passo ${stepIndex + 1} de ${WIZ_STEPS.length}`;
  const navVisible = key !== 'gerando' && key !== 'roteiro' && key !== 'exportar';
  const roteiro = wiz.roteiro;
  const tableHtml = roteiro ? renderMarkdownTable(roteiro.tabela_md) : '';
  const trackName = roteiro ? matchTrack(roteiro.trilha_mood) : TRACKS[0];

  return (
    <>
      <div className="wizard-head">
        <div>
          <p className="eyebrow">Novo projeto</p>
          <h1>Criar vídeo</h1>
        </div>
        <button className="btn-danger-text" onClick={() => router.push('/painel')}>cancelar</button>
      </div>

      <div className="rail">
        {WIZ_STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`rail-step${i < stepIndex ? ' is-done' : ''}${i === stepIndex ? ' is-current' : ''}`}
          >
            <span className="n">{i + 1}</span>
            <span className="l">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Step 1: Duração */}
      <div className={`step-panel${key === 'duracao' ? ' is-active' : ''}`} data-step="duracao">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Qual a duração do vídeo?</h2>
        <p className="step-sub">A duração define o tamanho do roteiro e o preço da criação.</p>
        <div className="dur-grid">
          <button
            className={`dur-card${wiz.duration === 30 ? ' is-selected' : ''}`}
            onClick={() => setWiz((w) => ({ ...w, duration: 30 }))}
          >
            <span className="promo-ribbon" style={{ position: 'static', display: 'inline-block', marginBottom: '0.6rem' }}>Oferta</span>
            <p className="dur">30 segundos</p>
            <div className="price-figure"><span className="now">R$ 25</span><span className="was">R$ 50</span></div>
            <p className="credits-note">1 crédito</p>
          </button>
          <button
            className={`dur-card${wiz.duration === 60 ? ' is-selected' : ''}`}
            onClick={() => setWiz((w) => ({ ...w, duration: 60 }))}
          >
            <p className="dur">60 segundos</p>
            <div className="price-figure"><span className="now">R$ 50</span></div>
            <p className="credits-note">2 créditos</p>
          </button>
        </div>
      </div>

      {/* Step 2: Link */}
      <div className={`step-panel${key === 'link' ? ' is-active' : ''}`} data-step="link">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Cole o link do site</h2>
        <p className="step-sub">A Curta analisa a página e sugere um brief de partida (produto, público, tom, CTA...). Sem link? Preencha o brief manualmente.</p>
        <label className="field">
          <span className="l">Link do site</span>
          <input type="url" id="input-link" placeholder="https://seusite.com.br" defaultValue={wiz.link} />
        </label>
        <div className="link-actions">
          <button className="btn btn-primary" onClick={analyzeLink} disabled={analyzing}>
            {analyzing ? 'Analisando site...' : 'Analisar site'}
          </button>
          <button className="btn btn-ghost" onClick={() => goToStep(WIZ_STEPS.findIndex((s) => s.key === 'brief'))}>
            Preencher brief manualmente
          </button>
        </div>
      </div>

      {/* Step 3: Brief */}
      <div className={`step-panel wide${key === 'brief' ? ' is-active' : ''}`} data-step="brief">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Brief do vídeo</h2>
        <p className="step-sub">Revise os campos abaixo antes de gerar o roteiro. Se vier de um link, ajuste o que parecer errado.</p>
        <div className="brief-grid">
          {BRIEF_FIELDS.map((f) => (
            <label className="field" key={f.key}>
              <span className="l">{f.label}</span>
              {f.area ? (
                <textarea
                  placeholder={f.placeholder}
                  value={wiz.brief[f.key]}
                  onChange={(e) => setWiz((w) => ({ ...w, brief: { ...w.brief, [f.key]: e.target.value } }))}
                />
              ) : (
                <input
                  type="text"
                  placeholder={f.placeholder}
                  value={wiz.brief[f.key]}
                  onChange={(e) => setWiz((w) => ({ ...w, brief: { ...w.brief, [f.key]: e.target.value } }))}
                />
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Step 4: Gerando */}
      <div className={`step-panel${key === 'gerando' ? ' is-active' : ''}`} data-step="gerando">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Gerando roteiro</h2>
        <p className="step-sub">Montando tabela técnica, narração para ElevenLabs e sugestão de voz a partir do brief.</p>
        <div className="gerar-stage">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: progress + '%' }} />
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', marginTop: '0.75rem' }}>
            {stage === 'done' ? 'Roteiro pronto. Avançando...' : 'Processando...'}
          </p>
        </div>
      </div>

      {/* Step 5: Roteiro */}
      <div className={`step-panel wide${key === 'roteiro' ? ' is-active' : ''}`} data-step="roteiro">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Roteiro gerado</h2>
        <p className="step-sub">Direção técnica completa + texto pronto para síntese de voz (ElevenLabs).</p>
        {roteiro?.aviso && (
          <div className="roteiro-aviso">
            <p className="eyebrow">Aviso</p>
            <p>{roteiro.aviso}</p>
          </div>
        )}
        <div className="roteiro-section">
          <div className="roteiro-section-head">
            <p className="eyebrow">Parte 1 — Direção técnica</p>
            <button
              className="roteiro-copy-btn"
              onClick={() => copyToClipboard(roteiro?.tabela_md || '', 'tabela técnica')}
              disabled={!roteiro?.tabela_md}
              aria-label="Copiar tabela técnica em markdown"
            >
              Copiar
            </button>
          </div>
          <div
            className="roteiro-table-wrap"
            dangerouslySetInnerHTML={{ __html: tableHtml }}
          />
        </div>
        <div className="roteiro-section">
          <div className="roteiro-section-head">
            <p className="eyebrow">Parte 2 — Narração (ElevenLabs)</p>
            <button
              className="roteiro-copy-btn"
              onClick={() => copyToClipboard(roteiro?.narracao_texto || '', 'narração')}
              disabled={!roteiro?.narracao_texto}
              aria-label="Copiar texto de narração"
            >
              Copiar
            </button>
          </div>
          <textarea
            className="roteiro-narracao"
            readOnly
            value={roteiro?.narracao_texto || ''}
            placeholder="Gere o roteiro para ver a narração."
            onFocus={(e) => e.target.select()}
          />
          {roteiro?.voz && (roteiro.voz.estilo || roteiro.voz.estabilidade || roteiro.voz.exaggeration) && (
            <div className="roteiro-voz-card">
              <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>Sugestão de voz</p>
              <dl>
                <div><dt>Estilo</dt><dd>{roteiro.voz.estilo || '—'}</dd></div>
                <div><dt>Estabilidade</dt><dd>{roteiro.voz.estabilidade || '—'}</dd></div>
                <div><dt>Exaggeration</dt><dd>{roteiro.voz.exaggeration || '—'}</dd></div>
              </dl>
            </div>
          )}
        </div>
        <div className="roteiro-section">
          <div className="roteiro-section-head">
            <p className="eyebrow">Trilha sonora (mood)</p>
          </div>
          <div className="roteiro-trilha-card">
            <div className="track-row">
              <span className="track-chip is-selected">{trackName}</span>
              <span className="roteiro-mood-source">derivado de: {roteiro?.trilha_mood || 'ambiente calmo'}</span>
            </div>
            {key === 'roteiro' && <AudioPreview />}
          </div>
        </div>
        <div className="roteiro-actions">
          <button className="btn btn-ghost" onClick={() => goToStep(WIZ_STEPS.findIndex((s) => s.key === 'brief'))}>
            Voltar ao brief
          </button>
          <button className="btn btn-primary" onClick={goNext}>
            Continuar
          </button>
        </div>
      </div>

      {/* Step 6: Preview vídeo */}
      <div className={`step-panel${key === 'preview-video' ? ' is-active' : ''}`} data-step="preview-video">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Prévia do vídeo</h2>
        <p className="step-sub">Um rascunho rápido de como as cenas vão se encaixar, a partir do roteiro.</p>
        <div className="preview-stage">
          <span className="preview-badge">Prévia · rascunho</span>
          {key === 'preview-video' && (
            <KineticPreview
              script={roteiro?.narracao_texto || ''}
              title={wiz.brief.produto || 'Vídeo'}
            />
          )}
        </div>
      </div>

      {/* Step 7: Preview áudio */}
      <div className={`step-panel${key === 'preview-audio' ? ' is-active' : ''}`} data-step="preview-audio">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Prévia do áudio</h2>
        <p className="step-sub">Ouça o ritmo e o clima da narração sugerida.</p>
        {key === 'preview-audio' && <AudioPreview />}
      </div>

      {/* Step 8: Exportar */}
      <div className={`step-panel${key === 'exportar' ? ' is-active' : ''}`} data-step="exportar">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Gerar e exportar</h2>
        <p className="step-sub">
          Isso vai consumir {wiz.duration === 60 ? '2 créditos (R$ 50)' : '1 crédito (R$ 25, oferta)'} do seu saldo e gerar o vídeo final.
        </p>
        <div className="gerar-stage">
          {stage === 'idle' && (
            <button className="btn btn-primary btn-lg btn-block" onClick={startGeneration}>
              Gerar vídeo final
            </button>
          )}
          {stage === 'running' && (
            <div>
              <div className="progress-track"><div className="progress-fill" style={{ width: progress + '%' }} /></div>
              <div className="progress-log">
                {GEN_STAGES.map((s, i) => {
                  const pct = Math.round(((i + 1) / GEN_STAGES.length) * 100);
                  const cls = pct <= progress ? 'done' : i === Math.floor(progress / (100 / GEN_STAGES.length)) ? 'active' : '';
                  return <div key={s} className={cls}>{s}</div>;
                })}
              </div>
            </div>
          )}
          {stage === 'done' && lastProject && (
            <div>
              <div className="preview-stage" style={{ marginBottom: '1rem' }}>
                <span className="preview-badge">Pronto</span>
                <KineticPreview script={lastProject.roteiro} title={lastProject.titulo} />
              </div>
              <div className="export-grid">
                <button
                  className="btn btn-quiet"
                  onClick={() => download(slug(lastProject.titulo) + '.srt', buildSrt(lastProject))}
                >
                  Baixar legendas (.srt)
                </button>
                <button
                  className="btn btn-quiet"
                  onClick={() => download(slug(lastProject.titulo) + '-resumo.txt', buildSummary(lastProject))}
                >
                  Baixar resumo (.txt)
                </button>
              </div>
              <p style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)', marginTop: '1rem' }}>
                Vídeo gerado. Baixe os arquivos ou crie outro.
              </p>
            </div>
          )}
        </div>
        {stage === 'done' && (
          <div className="wizard-nav" style={{ marginTop: '1.5rem', maxWidth: 'none' }}>
            <button className="btn btn-ghost" onClick={() => router.push('/projetos')}>Ver meus projetos</button>
            <button className="btn btn-primary" onClick={resetWizard}>Criar outro vídeo</button>
          </div>
        )}
      </div>

      {navVisible && (
        <div className="wizard-nav">
          <button className="btn btn-ghost" onClick={goBack} hidden={stepIndex === 0}>Voltar</button>
          <button className="btn btn-primary" onClick={goNext}>Continuar</button>
        </div>
      )}
    </>
  );
}

/* ---------- audio preview (Web Audio synth) ---------- */
function AudioPreview() {
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: 48 }, (_, i) => 15 + (i % 7) * 6));

  useEffect(() => {
    let raf = 0;
    let active = false;
    const animate = (durationMs: number) => {
      const start = performance.now();
      const arr = bars.slice();
      const frame = (now: number) => {
        const elapsed = now - start;
        for (let idx = 0; idx < arr.length; idx++) {
          const phase = elapsed / 90 + idx * 0.5;
          const v = elapsed < durationMs ? 30 + 65 * Math.abs(Math.sin(phase)) : 20;
          arr[idx] = v;
        }
        setBars(arr.slice());
        if (elapsed < durationMs + 200) raf = requestAnimationFrame(frame);
        else active = false;
      };
      if (active) return;
      active = true;
      raf = requestAnimationFrame(frame);
    };

    const play = () => {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx: AudioContext = new Ctx();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const notes = [220, 262, 294, 262, 330, 294, 220, 262];
        let t = audioCtx.currentTime;
        notes.forEach((freq) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
          osc.connect(gain).connect(audioCtx.destination);
          osc.start(t);
          osc.stop(t + 0.35);
          t += 0.28;
        });
        animate(notes.length * 0.28 * 1000);
      } catch {
        animate(2000);
      }
    };

    const btn = document.getElementById('wave-play-btn');
    if (btn) btn.addEventListener('click', play);
    return () => {
      if (btn) btn.removeEventListener('click', play);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [bars]);

  return (
    <div className="wave-stage">
      <div className="wave-row">
        <button className="wave-play" id="wave-play-btn" aria-label="Reproduzir prévia">▶</button>
        <div className="wave-bars">
          {bars.map((h, i) => (
            <i key={i} style={{ height: h + '%' }} className={h > 70 ? 'is-loud' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}