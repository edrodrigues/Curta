'use client';

import { useEffect, useState } from 'react';
import { KineticPreview } from '@/components/Canvas';
import { STYLES, TRACKS, genId, type Project, type WizardData } from '@/lib/types';
import { useStore, useToast } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/lib/RequireAuth';

const WIZ_STEPS: { key: string; label: string }[] = [
  { key: 'link', label: 'Link' },
  { key: 'duracao', label: 'Duração' },
  { key: 'roteiro', label: 'Roteiro' },
  { key: 'estilo', label: 'Estilo' },
  { key: 'preview-video', label: 'Vídeo' },
  { key: 'preview-audio', label: 'Áudio' },
  { key: 'gerar', label: 'Gerar' },
  { key: 'exportar', label: 'Exportar' },
];

const GEN_STAGES = [
  'Enviando roteiro para processamento',
  'Sintetizando narração (ElevenLabs via Monid)',
  'Compondo trilha sonora',
  'Renderizando cenas animadas',
  'Finalizando arquivo de vídeo',
];

const initialWiz: WizardData = {
  link: '',
  duration: null,
  titulo: '',
  roteiro: '',
  styleId: null,
  trackName: null,
};

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
    'Roteiro:',
    project.roteiro,
    '',
    '— Gerado no protótipo Curta (demonstração).',
  ].join('\n');
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

type Stage = 'idle' | 'running' | 'done';

function WizardShell() {
  const router = useRouter();
  const store = useStore();
  const { toast } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [wiz, setWiz] = useState<WizardData>(initialWiz);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [lastProject, setLastProject] = useState<Project | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [linkResult, setLinkResult] = useState<{ titulo: string; roteiro: string } | null>(null);

  const wordLimit = wiz.duration === 60 ? 140 : 70;
  const wordCount = wiz.roteiro.trim() ? wiz.roteiro.trim().split(/\s+/).length : 0;

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
    if (key === 'roteiro' && wiz.roteiro.trim().length < 8) {
      toast('Escreva um roteiro antes de continuar.');
      return false;
    }
    if (key === 'estilo' && (!wiz.styleId || !wiz.trackName)) {
      toast('Escolha um estilo de narração e uma trilha.');
      return false;
    }
    return true;
  }

  function goNext() {
    if (!validateStep()) return;
    if (stepIndex < WIZ_STEPS.length - 1) goToStep(stepIndex + 1);
  }
  function goBack() {
    if (stepIndex > 0) goToStep(stepIndex - 1);
  }

  async function analyzeLink() {
    const raw = (document.getElementById('input-link') as HTMLInputElement).value.trim();
    if (!raw) {
      toast('Cole um link para analisar, ou escreva o roteiro do zero.');
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
    setLinkResult(null);
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
      if (!res.ok || !data.ok) {
        toast(data?.message || 'Não foi possível analisar o site agora.');
        setAnalyzing(false);
        return;
      }
      const titulo: string = data.titulo || 'Conheça ' + url.hostname.replace(/^www\./, '');
      const cenas: string[] = Array.isArray(data.cenas) ? data.cenas : [];
      const roteiro = cenas.join('\n\n');
      setLinkResult({ titulo, roteiro: roteiro });
      setWiz((w) => ({ ...w, link: url.toString(), titulo, roteiro }));
      toast('Sugestão de roteiro gerada a partir do link.');
    } catch {
      toast('Falha de conexão ao analisar o site. Tente novamente.');
    } finally {
      setAnalyzing(false);
    }
  }

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
    const styleObj = STYLES.find((s) => s.id === wiz.styleId) || STYLES[0];
    const project: Project = {
      id: genId(),
      titulo: wiz.titulo || 'Vídeo sem título',
      roteiro: wiz.roteiro,
      duracao: wiz.duration || 30,
      estiloId: styleObj.id,
      estiloNome: styleObj.nome,
      trilhaNome: wiz.trackName || TRACKS[0],
      status: 'pronto',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    store.chargeCredits(cost);
    store.addProject(project);
    setLastProject(project);
    setStage('done');
    setStepIndex(WIZ_STEPS.length - 1);
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

  const eyebrowText = `Passo ${stepIndex + 1} de ${WIZ_STEPS.length}`;
  const navVisible = key !== 'gerar' && key !== 'exportar';

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

      {/* Step 1: Link */}
      <div className={`step-panel${key === 'link' ? ' is-active' : ''}`} data-step="link">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Cole o link do site</h2>
        <p className="step-sub">A Curta analisa a página e sugere um título e um roteiro de partida. Não tem um link à mão? Pode escrever o roteiro do zero.</p>
        <label className="field">
          <span className="l">Link do site</span>
          <input type="url" id="input-link" placeholder="https://seusite.com.br" defaultValue={wiz.link} />
        </label>
        <div className="link-actions">
          <button className="btn btn-primary" onClick={analyzeLink} disabled={analyzing}>
            {analyzing ? 'Analisando site...' : 'Analisar site'}
          </button>
          <button className="btn btn-ghost" onClick={goNext}>Escrever roteiro do zero</button>
        </div>
        {linkResult && (
          <div className="link-suggestion">
            <p className="eyebrow">Sugestão gerada a partir do link</p>
            <h4>{linkResult.titulo}</h4>
            <p>{linkResult.roteiro}</p>
          </div>
        )}
      </div>

      {/* Step 2: Duração */}
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

      {/* Step 3: Roteiro */}
      <div className={`step-panel${key === 'roteiro' ? ' is-active' : ''}`} data-step="roteiro">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Escreva o roteiro</h2>
        <p className="step-sub">Escreva como se estivesse explicando em voz alta. Frases curtas narram melhor. Se você veio de um link, revise a sugestão antes de continuar.</p>
        <label className="field">
          <span className="l">Título do vídeo</span>
          <input
            type="text"
            placeholder="Ex.: Como funciona o Pix"
            maxLength={70}
            value={wiz.titulo}
            onChange={(e) => setWiz((w) => ({ ...w, titulo: e.target.value }))}
          />
        </label>
        <label className="field">
          <span className="l">Roteiro</span>
          <textarea
            placeholder="Ex.: O Pix é o sistema de pagamento instantâneo do Brasil. Em segundos, você transfere dinheiro..."
            value={wiz.roteiro}
            onChange={(e) => setWiz((w) => ({ ...w, roteiro: e.target.value }))}
          />
          <span className="hint"><span>{wordCount}</span> / <span>{wordLimit}</span> palavras recomendadas</span>
        </label>
      </div>

      {/* Step 4: Estilo */}
      <div className={`step-panel wide${key === 'estilo' ? ' is-active' : ''}`} data-step="estilo">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Estilo de narração e trilha</h2>
        <p className="step-sub">A narração é sintetizada com vozes da ElevenLabs via Monid.</p>
        <div className="style-grid">
          {STYLES.map((s) => (
            <button
              key={s.id}
              className={`style-card${wiz.styleId === s.id ? ' is-selected' : ''}`}
              onClick={() => setWiz((w) => ({ ...w, styleId: s.id }))}
            >
              <h4>{s.nome}</h4>
              <p>{s.desc}</p>
            </button>
          ))}
        </div>
        <p className="eyebrow" style={{ marginBottom: '0.75rem' }}>Clima da trilha sonora</p>
        <div className="track-row">
          {TRACKS.map((t) => (
            <button
              key={t}
              className={`track-chip${wiz.trackName === t ? ' is-selected' : ''}`}
              onClick={() => setWiz((w) => ({ ...w, trackName: t }))}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Step 5: Preview vídeo */}
      <div className={`step-panel${key === 'preview-video' ? ' is-active' : ''}`} data-step="preview-video">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Prévia do vídeo</h2>
        <p className="step-sub">Um rascunho rápido de como as cenas vão se encaixar, a partir do seu roteiro.</p>
        <div className="preview-stage">
          <span className="preview-badge">Prévia · rascunho</span>
          {key === 'preview-video' && <KineticPreview script={wiz.roteiro} title={wiz.titulo} />}
        </div>
      </div>

      {/* Step 6: Preview áudio */}
      <div className={`step-panel${key === 'preview-audio' ? ' is-active' : ''}`} data-step="preview-audio">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Prévia do áudio</h2>
        <p className="step-sub">Ouça o ritmo e o clima da narração escolhida. A voz final é gerada na etapa de geração.</p>
        {key === 'preview-audio' && <AudioPreview />}
      </div>

      {/* Step 7: Gerar */}
      <div className={`step-panel${key === 'gerar' ? ' is-active' : ''}`} data-step="gerar">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Gerar vídeo final</h2>
        <p className="step-sub">Isso vai consumir {wiz.duration === 60 ? '2 créditos (R$ 50)' : '1 crédito (R$ 25, oferta)'} do seu saldo.</p>
        <div className="gerar-stage">
          {stage === 'idle' && (
            <button className="btn btn-primary btn-lg btn-block" onClick={startGeneration}>Gerar vídeo</button>
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
          {stage === 'done' && (
            <p style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>Vídeo gerado. Continue para exportar.</p>
          )}
        </div>
      </div>

      {/* Step 8: Exportar */}
      <div className={`step-panel${key === 'exportar' ? ' is-active' : ''}`} data-step="exportar">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Exportar</h2>
        <p className="step-sub">Seu vídeo está pronto. Baixe os arquivos ou volte para os seus projetos.</p>
        <div className="preview-stage">
          <span className="preview-badge">Pronto</span>
          {lastProject && <KineticPreview script={lastProject.roteiro} title={lastProject.titulo} />}
        </div>
        <div className="export-grid">
          <button
            className="btn btn-quiet"
            onClick={() => lastProject && download(slug(lastProject.titulo) + '.srt', buildSrt(lastProject))}
            disabled={!lastProject}
          >
            Baixar legendas (.srt)
          </button>
          <button
            className="btn btn-quiet"
            onClick={() => lastProject && download(slug(lastProject.titulo) + '-resumo.txt', buildSummary(lastProject))}
            disabled={!lastProject}
          >
            Baixar resumo (.txt)
          </button>
        </div>
        <div className="wizard-nav" style={{ maxWidth: 'none' }}>
          <button className="btn btn-ghost" onClick={() => router.push('/projetos')}>Ver meus projetos</button>
          <button className="btn btn-primary" onClick={() => { setWiz(initialWiz); setLastProject(null); setStage('idle'); setStepIndex(0); setLinkResult(null); }}>Criar outro vídeo</button>
        </div>
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
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
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