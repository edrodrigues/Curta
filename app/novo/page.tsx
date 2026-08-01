'use client';

import { useEffect, useRef, useState } from 'react';
import { KineticPreview } from '@/components/Canvas';
import {
  emptyBrief,
  genId,
  matchStyle,
  matchTrack,
  TRACKS,
  TRACK_AUDIO_URLS,
  VIDEO_FORMATS,
  type Brief,
  type Project,
  type RoteiroOutput,
  type SceneRender,
  type WizardData,
  type VideoStage,
} from '@/lib/types';
import { useStore, useToast } from '@/lib/store';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { RequireAuth } from '@/lib/RequireAuth';
import { loadProject, createProject, updateProject, updateProjectStatus } from '@/lib/projects';
import { useAuth } from '@/lib/auth';
import { narrationVoiceForStyle } from '@/lib/monid/voices';

const WIZ_STEPS: { key: string; label: string }[] = [
  { key: 'duracao', label: 'Duração' },
  { key: 'formato', label: 'Formato' },
  { key: 'link', label: 'Link' },
  { key: 'brief', label: 'Brief' },
  { key: 'gerando', label: 'Gerando' },
  { key: 'roteiro', label: 'Roteiro' },
  { key: 'preview-video', label: 'Vídeo' },
  { key: 'preview-audio', label: 'Áudio' },
  { key: 'exportar', label: 'Exportar' },
];

const SCENE_ETA_SECONDS = 180;
const ASSEMBLE_ETA_SECONDS = 45;

const SERVICE_LOGOS: Record<'YouTube' | 'Instagram' | 'LinkedIn', JSX.Element> = {
  YouTube: (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#FF0000" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8Z" />
      <path fill="#fff" d="M9.6 15.6V8.4l6.2 3.6-6.2 3.6Z" />
    </svg>
  ),
  Instagram: (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
        <stop offset="0%" stopColor="#FFDD55" />
        <stop offset="10%" stopColor="#FFDD55" />
        <stop offset="50%" stopColor="#FF543E" />
        <stop offset="100%" stopColor="#C837AB" />
      </radialGradient>
    </defs>
    <rect x="2" y="2" width="20" height="20" rx="5.5" fill="url(#ig-grad)" />
    <circle cx="12" cy="12" r="4.5" fill="none" stroke="#fff" strokeWidth="1.8" />
    <circle cx="17.5" cy="6.5" r="1.3" fill="#fff" />
    </svg>
  ),
  LinkedIn: (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#0A66C2" d="M20.45 20.45h-3.56v-5.56c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.44-2.13 2.93v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.55V9h3.57v11.45ZM22.22 0H1.77C.8 0 0 .78 0 1.73v20.54C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .78 23.2 0 22.22 0Z" />
    </svg>
  ),
};

const GEN_STAGES = [
  'Sintetizando narração (ElevenLabs via Monid)',
  'Compondo trilha sonora',
  'Renderizando cenas animadas',
  'Finalizando arquivo de vídeo',
];

const ROTEIRO_STAGES = [
  'Analisando o brief',
  'Estruturando tabela técnica',
  'Escrevendo narração',
  'Atribuindo sugestão de voz',
  'Finalizando roteiro',
];

const LINK_PHASES = [
  'Buscando a página…',
  'Extraindo conteúdo…',
  'Analisando com IA…',
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
  videoFormat: null,
  brief: { ...emptyBrief },
  roteiro: null,
  sceneRenders: [],
  finalVideoUrl: null,
  finalVideoKey: null,
  videoStage: 'idle',
  videoCostEstimateUsd: null,
  narrationStage: 'idle',
  narrationRunId: null,
  narrationKey: null,
  narrationUrl: null,
  narrationError: null,
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

function formatEta(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
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
      <Suspense fallback={null}>
        <div className="container wizard-shell">
          <WizardShell />
        </div>
      </Suspense>
    </RequireAuth>
  );
}

function WizardShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const store = useStore();
  const { toast } = useToast();
  const { user } = useAuth();
  const pendingUrl = searchParams.get('url') || '';
  const projectIdParam = searchParams.get('id');
  const [stepIndex, setStepIndex] = useState(0);
  const [wiz, setWiz] = useState<WizardData>(() => ({ ...initialWiz, link: pendingUrl }));
  const [stage, setStage] = useState<Stage>('idle');
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzePhase, setAnalyzePhase] = useState(-1);
  const [briefAttempted, setBriefAttempted] = useState(false);
  const [roteiroStageIdx, setRoteiroStageIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [lastProject, setLastProject] = useState<Project | null>(null);
  const [autoAnalyzed, setAutoAnalyzed] = useState(false);
  const [loadingProject, setLoadingProject] = useState(!!projectIdParam);
  const [dbProjectId, setDbProjectId] = useState<string | null>(null);
  const ensureDraftRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoStartedAtRef = useRef<number | null>(null);
  const serverUpdatedAtRef = useRef<string | null>(null);
  const skipAutosaveRef = useRef(false);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const etaAnchorRef = useRef<{ at: number; value: number } | null>(null);
  const lastEtaKeyRef = useRef('');

  async function refreshNarrationUrl(w: WizardData): Promise<WizardData> {
    if (!w.narrationKey || w.narrationStage !== 'done') return w;
    try {
      const signRes = await fetch('/api/audio/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: w.narrationKey }),
      });
      const signData = await signRes.json();
      if (signRes.ok && signData?.ok && signData.url) {
        return { ...w, narrationUrl: signData.url };
      }
    } catch {
      /* keep stored url if refresh fails */
    }
    return w;
  }

  useEffect(() => {
    if (!projectIdParam) { setLoadingProject(false); return; }
    let cancelled = false;
    (async () => {
      skipAutosaveRef.current = true;
      const result = await loadProject(projectIdParam);
      if (cancelled) return;
      if (!result) {
        toast('Projeto não encontrado.');
        router.replace('/projetos');
        return;
      }
      const { project, wizard, stepIndex: savedStep, updated_at } = result;
      let nextWiz = wizard;
      if (wizard.finalVideoKey) {
        try {
          const signRes = await fetch('/api/video/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: wizard.finalVideoKey }),
          });
          const signData = await signRes.json();
          if (!cancelled && signRes.ok && signData?.ok && signData.url) {
            nextWiz = {
              ...wizard,
              finalVideoUrl: signData.url,
              videoStage: wizard.videoStage === 'error' ? 'done' : wizard.videoStage,
            };
          }
        } catch {
          /* keep stored url if refresh fails */
        }
      }
      nextWiz = await refreshNarrationUrl(nextWiz);
      if (cancelled) return;
      serverUpdatedAtRef.current = updated_at;
      setWiz(nextWiz);
      setStepIndex(savedStep);
      setDbProjectId(projectIdParam);
      setLastProject(project);
      setLoadingProject(false);
      window.setTimeout(() => { skipAutosaveRef.current = false; }, 500);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdParam]);

  function buildExtras() {
    const roteiro = wiz.roteiro;
    const styleObj = roteiro ? matchStyle(roteiro.voz.estilo) : { id: '', nome: '' };
    const trilhaNome = roteiro ? matchTrack(roteiro.trilha_mood) : TRACKS[0];
    return {
      estiloId: styleObj.id,
      estiloNome: styleObj.nome,
      trilhaNome,
      tabela_md: roteiro?.tabela_md ?? '',
      titulo: wiz.brief.produto,
    };
  }

  async function ensureDraft() {
    if (dbProjectId || ensureDraftRef.current || !user) return;
    ensureDraftRef.current = true;
    const created = await createProject(user.id, {
      wizard: wiz,
      stepIndex,
      extras: buildExtras(),
    });
    if (created) {
      setDbProjectId(created.id);
      serverUpdatedAtRef.current = created.updated_at;
    } else {
      toast('Não foi possível criar o rascunho.');
      ensureDraftRef.current = false;
    }
  }

  useEffect(() => {
    if (!dbProjectId || loadingProject || skipAutosaveRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (skipAutosaveRef.current) return;
      const expected = serverUpdatedAtRef.current;
      const result = await updateProject(
        dbProjectId,
        { wizard: wiz, stepIndex, extras: buildExtras() },
        { expectedUpdatedAt: expected }
      );
      if (result.ok) {
        serverUpdatedAtRef.current = result.updated_at;
      } else if (result.reason === 'stale') {
        const fresh = await loadProject(dbProjectId);
        if (fresh) {
          serverUpdatedAtRef.current = fresh.updated_at;
          skipAutosaveRef.current = true;
          let nextWiz = fresh.wizard;
          if (fresh.wizard.finalVideoKey) {
            try {
              const signRes = await fetch('/api/video/sign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: fresh.wizard.finalVideoKey }),
              });
              const signData = await signRes.json();
              if (signRes.ok && signData?.ok && signData.url) {
                nextWiz = {
                  ...fresh.wizard,
                  finalVideoUrl: signData.url,
                  videoStage: fresh.wizard.videoStage === 'error' ? 'done' : fresh.wizard.videoStage,
                };
              }
            } catch { /* keep */ }
          }
          nextWiz = await refreshNarrationUrl(nextWiz);
          setWiz(nextWiz);
          setStepIndex(fresh.stepIndex);
          setLastProject(fresh.project);
          window.setTimeout(() => { skipAutosaveRef.current = false; }, 500);
          toast('Projeto atualizado em outra aba — estado recarregado.');
        }
      }
    }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wiz, stepIndex, dbProjectId, loadingProject]);

  const key = WIZ_STEPS[stepIndex].key;

  function goToStep(i: number) {
    setStage('idle');
    setProgress(0);
    setBriefAttempted(false);
    setStepIndex(Math.max(0, Math.min(WIZ_STEPS.length - 1, i)));
  }

  function validateStep(): boolean {
    if (key === 'duracao' && !wiz.duration) {
      toast('Escolha uma duração para continuar.');
      return false;
    }
    if (key === 'formato' && !wiz.videoFormat) {
      toast('Escolha um formato de vídeo para continuar.');
      return false;
    }
    if (key === 'brief') {
      const b = wiz.brief;
      if (!b.produto.trim() || !b.cta.trim()) {
        setBriefAttempted(true);
        toast('Preencha ao menos Produto/Marca e CTA antes de gerar o roteiro.');
        return false;
      }
    }
    if (key === 'roteiro' && (!wiz.roteiro || !wiz.roteiro.narracao_texto)) {
      toast('Gere o roteiro antes de avançar.');
      return false;
    }
    if (key === 'roteiro' && wiz.roteiro && (!wiz.roteiro.cenas || wiz.roteiro.cenas.length === 0)) {
      toast('Roteiro sem cenas para gerar o vídeo. Refaça o roteiro.');
      return false;
    }
    return true;
  }

  function goNext() {
    if (!validateStep()) return;
    if (key === 'duracao' && !dbProjectId) {
      void ensureDraft();
    }
    if (key === 'brief') {
      setStage('idle');
      setGenerating(false);
      setProgress(0);
      setWiz((w) => ({
        ...w,
        roteiro: null,
        sceneRenders: [],
        finalVideoUrl: null,
        finalVideoKey: null,
        videoStage: 'idle',
        videoCostEstimateUsd: null,
        narrationStage: 'idle',
        narrationRunId: null,
        narrationKey: null,
        narrationUrl: null,
        narrationError: null,
      }));
      goToStep(stepIndex + 1);
      return;
    }
    if (key === 'roteiro') {
      void handleContinuarParaVideo();
      return;
    }
    if (stepIndex < WIZ_STEPS.length - 1) goToStep(stepIndex + 1);
  }
  function goBack() {
    if (stepIndex > 0) goToStep(stepIndex - 1);
  }

  const videoRunningRef = useRef(false);
  const assemblingRef = useRef(false);
  const videoTokenRef = useRef<string>('');
  const narrationRunningRef = useRef(false);
  const narrationAutoRef = useRef(false);

  async function handleContinuarParaVideo() {
    const roteiro = wiz.roteiro;
    if (!roteiro || !roteiro.cenas || roteiro.cenas.length === 0) {
      toast('Roteiro sem cenas para gerar o vídeo.');
      return;
    }

    const hasDone = wiz.videoStage === 'done' && (!!wiz.finalVideoUrl || !!wiz.finalVideoKey);
    const stageActive = wiz.videoStage === 'running' || wiz.videoStage === 'assembling';
    const hasAnyRenders = wiz.sceneRenders.length > 0;
    if (hasDone || stageActive || hasAnyRenders) {
      goToStep(stepIndex + 1);
      return;
    }

    await startVideoGeneration();
  }

  async function restoreFinalVideo() {
    const key = wiz.finalVideoKey;
    if (!key) {
      toast('Nenhum vídeo final salvo para restaurar.');
      return;
    }
    try {
      const signRes = await fetch('/api/video/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const signData = await signRes.json();
      if (!signRes.ok || !signData?.ok || !signData.url) {
        toast(signData?.message || 'Não foi possível restaurar o vídeo.');
        return;
      }
      setWiz((w) => ({
        ...w,
        finalVideoUrl: signData.url,
        videoStage: 'done',
      }));
      toast('Vídeo final restaurado.');
    } catch {
      toast('Falha de conexão ao restaurar o vídeo.');
    }
  }

  async function startVideoGeneration(opts?: { force?: boolean }) {
    const roteiro = wiz.roteiro;
    if (!roteiro || !roteiro.cenas || roteiro.cenas.length === 0) {
      toast('Roteiro sem cenas para gerar o vídeo.');
      return;
    }
    if (videoRunningRef.current) return;

    if (opts?.force) {
      const errs = wiz.sceneRenders.map((s) => s.error || '').join(' ');
      if (/BLOCKED/i.test(errs)) {
        const ok = typeof window !== 'undefined'
          ? window.confirm(
              'A Monid bloqueou a geração anterior (limite/política). Reenviar pode falhar de novo e consumir créditos. Continuar mesmo assim?'
            )
          : true;
        if (!ok) return;
      }
    }

    videoRunningRef.current = true;
    const token = 'f' + Date.now().toString(16) + Math.random().toString(16).slice(2);
    videoTokenRef.current = token;

    const seed: SceneRender[] = roteiro.cenas.map((c) => ({
      index: c.index,
      status: 'pendente',
    }));
    assemblingRef.current = false;
    setWiz((w) => ({
      ...w,
      sceneRenders: seed,
      finalVideoUrl: null,
      videoStage: 'running',
      videoCostEstimateUsd: null,
    }));
    videoStartedAtRef.current = Date.now();
    etaAnchorRef.current = null;
    lastEtaKeyRef.current = '';

    const previewIdx = WIZ_STEPS.findIndex((s) => s.key === 'preview-video');
    if (key !== 'preview-video') goToStep(previewIdx >= 0 ? previewIdx : stepIndex + 1);

    try {
      const res = await fetch('/api/video/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cenas: roteiro.cenas.map((c) => ({ prompt_en: c.prompt_en, duration_hint: c.duration_hint })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !Array.isArray(data.jobs)) {
        const msg = data?.message || 'Falha ao iniciar a geração dos clipes.';
        toast(msg);
        setWiz((w) => ({ ...w, videoStage: 'error' }));
        videoRunningRef.current = false;
        return;
      }
      const jobs: Array<{ index: number; run_id: string | null; status: string; error?: string }> = data.jobs;
      const estCost = typeof data.est_cost_usd === 'number' ? data.est_cost_usd : null;

      setWiz((w) => ({
        ...w,
        sceneRenders: w.sceneRenders.map((s) => {
          const j = jobs.find((jj) => jj.index === s.index);
          if (!j) return s;
          if (j.status === 'falhou') {
            return { ...s, status: 'falhou', error: j.error };
          }
          return { ...s, status: 'pendente', run_id: j.run_id || undefined };
        }),
        videoCostEstimateUsd: estCost,
      }));

      const allFailed = jobs.every((j) => j.status === 'falhou');
      if (allFailed) {
        const errs = jobs.map((j) => j.error || '').join(' ');
        const hint = /MONID_API_KEY/.test(errs)
          ? 'Chave da Monid ausente. Configure MONID_API_KEY.'
          : /BLOCKED/i.test(errs)
            ? 'A Monid bloqueou a geração (limite/política). Não reenvie em loop.'
            : /Limite de requisições|429/.test(errs)
              ? 'Limite de requisições da Monid atingido. Aguarde e tente novamente.'
              : 'Todos os clipes falharam ao iniciar.';
        toast(hint);
        setWiz((w) => ({ ...w, videoStage: 'error' }));
        videoRunningRef.current = false;
        return;
      }

      toast(`${jobs.filter((j) => j.status !== 'falhou').length} clipes iniciados na Monid.`);
    } catch {
      toast('Falha de conexão ao iniciar a geração dos clipes.');
      setWiz((w) => ({ ...w, videoStage: 'error' }));
      videoRunningRef.current = false;
    }
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
    setAnalyzePhase(0);
    const phaseTick = window.setInterval(() => {
      setAnalyzePhase((p) => (p < LINK_PHASES.length - 1 ? p + 1 : p));
    }, 1500);
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
        setAnalyzePhase(-1);
        return;
      }
      const brief: Brief = { ...emptyBrief, ...data.brief };
      setWiz((w) => ({ ...w, link: url.toString(), brief }));
      toast('Brief extraído do link. Revise e ajuste antes de gerar.');
      goToStep(WIZ_STEPS.findIndex((s) => s.key === 'brief'));
    } catch {
      toast('Falha de conexão ao analisar o site.');
    } finally {
      window.clearInterval(phaseTick);
      setAnalyzing(false);
      setAnalyzePhase(-1);
    }
  }

  async function runRoteiroGeneration() {
    if (generating) return;
    setGenerating(true);
    setStage('running');
    setProgress(0);
    setRoteiroStageIdx(0);
    let pct = 0;
    const tick = window.setInterval(() => {
      pct = Math.min(90, pct + 4 + Math.random() * 5);
      setProgress(Math.round(pct));
      setRoteiroStageIdx(
        Math.min(Math.floor((pct / 90) * ROTEIRO_STAGES.length), ROTEIRO_STAGES.length - 1)
      );
    }, 320);
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
        const statusMsg: Record<number, string> = {
          400: data?.message || 'Brief incompleto. Revise os dados antes de gerar.',
          502: 'A IA não conseguiu produzir o roteiro. Tente novamente.',
          503: 'Serviço de IA indisponível ou sem saldo. Tente novamente em instantes.',
          500: 'Erro inesperado ao gerar roteiro. Tente novamente.',
        };
        toast(statusMsg[res.status] || data?.message || 'Falha ao gerar roteiro.');
        setStage('idle');
        setGenerating(false);
        return;
      }
      const roteiro: RoteiroOutput = data.roteiro;
      setWiz((w) => ({ ...w, roteiro }));
      setProgress(100);
      setRoteiroStageIdx(ROTEIRO_STAGES.length - 1);
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

  async function generateNarration() {
    const roteiro = wiz.roteiro;
    const text = roteiro?.narracao_texto || '';
    if (!text) {
      toast('Gere o roteiro antes de gerar a narração.');
      return;
    }
    if (narrationRunningRef.current) return;
    narrationRunningRef.current = true;
    const voiceId = narrationVoiceForStyle(roteiro?.voz.estilo || '');
    const stability = Number.parseFloat(roteiro?.voz.estabilidade || '0.5');
    const exaggeration = Number.parseFloat(roteiro?.voz.exaggeration || '0');
    setWiz((w) => ({
      ...w,
      narrationStage: 'generating',
      narrationRunId: null,
      narrationKey: null,
      narrationUrl: null,
      narrationError: null,
    }));
    try {
      const res = await fetch('/api/audio/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: dbProjectId || undefined,
          text,
          voice_id: voiceId,
          stability: Number.isFinite(stability) ? stability : 0.5,
          style: Number.isFinite(exaggeration) ? exaggeration : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const msg = data?.message || 'Falha ao gerar a narração.';
        setWiz((w) => ({ ...w, narrationStage: 'error', narrationError: msg }));
        toast(msg);
        return;
      }
      setWiz((w) => ({
        ...w,
        narrationStage: 'done',
        narrationRunId: typeof data.run_id === 'string' ? data.run_id : null,
        narrationKey: typeof data.narration_key === 'string' ? data.narration_key : null,
        narrationUrl: typeof data.narration_url === 'string' ? data.narration_url : null,
        narrationError: null,
      }));
      toast('Narração gerada.');
    } catch {
      const msg = 'Falha de conexão ao gerar a narração.';
      setWiz((w) => ({ ...w, narrationStage: 'error', narrationError: msg }));
      toast(msg);
    } finally {
      narrationRunningRef.current = false;
    }
  }

  async function reloadNarration() {
    if (!wiz.narrationKey) {
      void generateNarration();
      return;
    }
    const signed = await refreshNarrationUrl({ ...wiz, narrationStage: 'done' });
    setWiz(signed);
    toast(signed.narrationUrl ? 'Áudio recarregado.' : 'Não foi possível recarregar o áudio.');
  }

  useEffect(() => {
    if (key !== 'preview-audio') {
      narrationAutoRef.current = false;
      return;
    }
    if (narrationAutoRef.current || narrationRunningRef.current) return;
    if (wiz.narrationStage === 'idle' && !!wiz.roteiro?.narracao_texto) {
      narrationAutoRef.current = true;
      void generateNarration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wiz.narrationStage, wiz.roteiro]);

  useEffect(() => {
    if (key === 'gerando' && !generating && stage !== 'done' && stage !== 'running') {
      void runRoteiroGeneration();
    }
    if (key !== 'gerando' && stage === 'running') {
      setStage('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (key === 'link' && pendingUrl && !autoAnalyzed && !analyzing) {
      setAutoAnalyzed(true);
      void analyzeLink();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pendingUrl, autoAnalyzed, analyzing]);

  useEffect(() => {
    if (key !== 'preview-video') return;
    if (wiz.videoStage !== 'running') return;
    const pending = wiz.sceneRenders.filter(
      (s) => s.status === 'pendente' || s.status === 'rodando'
    );
    if (pending.length === 0) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const toPoll = wiz.sceneRenders
        .filter((s) => s.status === 'pendente' || s.status === 'rodando')
        .filter((s) => !!s.run_id)
        .map((s) => ({ index: s.index, run_id: s.run_id! }));
      if (toPoll.length === 0) return;
      try {
        const res = await fetch('/api/video/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runs: toPoll }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok || !Array.isArray(data.jobs)) return;
        const jobs: Array<{ index: number; run_id?: string; status: string; clip_url?: string; error?: string }> = data.jobs;
        setWiz((w) => {
          const updated = w.sceneRenders.map((s) => {
            const j = jobs.find((jj) => jj.index === s.index);
            if (!j) return s;
            if (j.status === 'concluido' && j.clip_url) {
              return { ...s, status: 'concluido' as const, clip_url: j.clip_url };
            }
            if (j.status === 'falhou') {
              return { ...s, status: 'falhou' as const, error: j.error };
            }
            if (j.status === 'rodando') {
              return { ...s, status: 'rodando' as const };
            }
            return s;
          });
          return { ...w, sceneRenders: updated };
        });
      } catch {
        /* transient; retry on next tick */
      }
    };
    void tick();
    const id = window.setInterval(tick, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wiz.videoStage, wiz.sceneRenders]);

  useEffect(() => {
    if (key !== 'preview-video') return;
    if (wiz.videoStage !== 'running') return;
    if (wiz.sceneRenders.length === 0) return;
    const allDone = wiz.sceneRenders.every((s) => s.status === 'concluido' || s.status === 'falhou');
    if (!allDone) return;
    const anySuccess = wiz.sceneRenders.some((s) => s.status === 'concluido' && s.clip_url);
    if (!anySuccess) {
      const errs = wiz.sceneRenders.map((s) => s.error || '').join(' ');
      const hint = /MONID_API_KEY/.test(errs)
        ? 'Chave da Monid ausente. Configure MONID_API_KEY.'
        : /BLOCKED/i.test(errs)
          ? 'A Monid bloqueou a geração (limite/política). Não reenvie em loop.'
          : /Limite de requisições|429/.test(errs)
            ? 'Limite de requisições da Monid atingido. Aguarde e tente novamente.'
            : 'Todos os clipes falharam na geração.';
      setWiz((w) => ({ ...w, videoStage: 'error' }));
      videoRunningRef.current = false;
      toast(hint);
      return;
    }

    if (assemblingRef.current) return;
    assemblingRef.current = true;

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setWiz((w) => ({ ...w, videoStage: 'assembling' }));
      try {
        const ordered = wiz.sceneRenders
          .filter((s) => s.status === 'concluido' && !!s.clip_url)
          .sort((a, b) => a.index - b.index)
          .map((s) => s.clip_url!);
        const res = await fetch('/api/video/assemble', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clip_urls: ordered, project_id: videoTokenRef.current }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok || !data.video_url) {
          toast(data?.message || 'Falha ao montar o vídeo final.');
          setWiz((w) => ({ ...w, videoStage: 'error' }));
          videoRunningRef.current = false;
          assemblingRef.current = false;
          return;
        }
        setWiz((w) => ({
          ...w,
          finalVideoUrl: data.video_url,
          finalVideoKey: typeof data.video_key === 'string' ? data.video_key : w.finalVideoKey,
          videoStage: 'done',
        }));
        videoRunningRef.current = false;
        assemblingRef.current = false;
        toast('Vídeo montado com sucesso.');
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return;
        toast('Falha de conexão ao montar o vídeo final.');
        setWiz((w) => ({ ...w, videoStage: 'error' }));
        videoRunningRef.current = false;
        assemblingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wiz.sceneRenders]);

  useEffect(() => {
    if (key !== 'preview-video' || wiz.videoStage === 'idle' || wiz.videoStage === 'done' || wiz.videoStage === 'error') {
      setEtaSeconds(null);
      etaAnchorRef.current = null;
      lastEtaKeyRef.current = '';
      return;
    }
    const remaining = wiz.sceneRenders.filter((s) => s.status === 'pendente' || s.status === 'rodando').length;
    const done = wiz.sceneRenders.filter((s) => s.status === 'concluido').length;
    const progressKey = `${wiz.videoStage}|${done}|${remaining}`;
    if (progressKey === lastEtaKeyRef.current && etaAnchorRef.current) return;
    lastEtaKeyRef.current = progressKey;
    let target: number;
    if (wiz.videoStage === 'assembling') {
      target = ASSEMBLE_ETA_SECONDS;
    } else {
      let perScene = SCENE_ETA_SECONDS;
      if (done > 0 && videoStartedAtRef.current) {
        const avg = (Date.now() - videoStartedAtRef.current) / 1000 / done;
        perScene = Math.min(600, Math.max(60, Math.round(avg)));
      }
      target = remaining * perScene;
    }
    etaAnchorRef.current = { at: Date.now(), value: target };
    setEtaSeconds(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wiz.videoStage, wiz.sceneRenders]);

  useEffect(() => {
    if (key !== 'preview-video' || (wiz.videoStage !== 'running' && wiz.videoStage !== 'assembling')) return;
    const id = window.setInterval(() => {
      setEtaSeconds((prev) => {
        const a = etaAnchorRef.current;
        if (prev == null || !a) return prev;
        return Math.max(0, a.value - Math.floor((Date.now() - a.at) / 1000));
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wiz.videoStage]);

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
      id: dbProjectId || genId(),
      titulo: wiz.brief.produto || 'Vídeo sem título',
      roteiro: roteiro.narracao_texto,
      tabela_md: roteiro.tabela_md,
      duracao: wiz.duration || 30,
      videoFormat: wiz.videoFormat ?? undefined,
      estiloId: styleObj.id,
      estiloNome: styleObj.nome,
      trilhaNome,
      status: 'pronto',
      createdAt: new Date().toISOString().slice(0, 10),
      videoUrl: wiz.finalVideoUrl || undefined,
    };
    store.chargeCredits(cost);
    if (dbProjectId) {
      void updateProjectStatus(dbProjectId, 'pronto', {
        ...(wiz.finalVideoUrl && { video_url: wiz.finalVideoUrl }),
        ...(wiz.narrationKey && { audio_url: wiz.narrationKey }),
        credits_charged: cost,
      });
    }
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
    setDbProjectId(null);
    ensureDraftRef.current = false;
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
  const videoActive = wiz.videoStage === 'running' || wiz.videoStage === 'assembling';
  const roteiro = wiz.roteiro;
  const tableHtml = roteiro ? renderMarkdownTable(roteiro.tabela_md) : '';
  const trackName = roteiro ? matchTrack(roteiro.trilha_mood) : TRACKS[0];

  if (loadingProject) {
    return (
      <div className="empty-state">
        <p>Carregando projeto…</p>
      </div>
    );
  }

  return (
    <>
      <div className="wizard-head">
        <div>
          <p className="eyebrow">{dbProjectId ? 'Continuar projeto' : 'Novo projeto'}</p>
          <h1>{dbProjectId ? wiz.brief.produto || 'Continuar vídeo' : 'Criar vídeo'}</h1>
        </div>
        <button className="btn-danger-text" onClick={() => router.push('/painel')}>cancelar</button>
      </div>

      <div className="rail">
        {WIZ_STEPS.map((s, i) => {
          const isPending = (s.key === 'link' && analyzing) || (s.key === 'gerando' && generating);
          return (
          <div
            key={s.key}
            className={`rail-step${i < stepIndex ? ' is-done' : ''}${i === stepIndex && !isPending ? ' is-current' : ''}${isPending ? ' is-pending' : ''}`}
          >
            <span className="n">{i + 1}</span>
            <span className="l">{s.label}</span>
          </div>
          );
        })}
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

      {/* Step 2: Formato */}
      <div className={`step-panel${key === 'formato' ? ' is-active' : ''}`} data-step="formato">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Qual o formato do vídeo?</h2>
        <p className="step-sub">Escolha a plataforma e a proporção ideais para onde o vídeo será publicado.</p>
        {(['YouTube', 'Instagram', 'LinkedIn'] as const).map((grupo) => (
          <div key={grupo} className="fmt-group">
            <p className="fmt-group-title">
              <span className="fmt-group-logo" aria-hidden="true">{SERVICE_LOGOS[grupo]}</span>
              <span>{grupo}</span>
            </p>
            <div className="fmt-grid">
              {VIDEO_FORMATS.filter((f) => f.grupo === grupo).map((f) => (
                <button
                  key={f.key}
                  className={`fmt-card${wiz.videoFormat === f.key ? ' is-selected' : ''}`}
                  onClick={() => setWiz((w) => ({ ...w, videoFormat: f.key }))}
                >
                  <p className="fmt-title">{f.titulo}</p>
                  <p className="fmt-aspect">{f.aspecto} <span className="fmt-res">{f.resolucao}</span></p>
                  <p className="fmt-desc">{f.descricao}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Step 3: Link */}
      <div className={`step-panel${key === 'link' ? ' is-active' : ''}`} data-step="link">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Cole o link do site</h2>
        <p className="step-sub">A Curta analisa a página e sugere um brief de partida (produto, público, tom, CTA...). Sem link? Preencha o brief manualmente.</p>
        <label className="field">
          <span className="l">Link do site</span>
          <input type="url" id="input-link" placeholder="https://seusite.com.br" defaultValue={wiz.link} disabled={analyzing} />
        </label>
        <div className="link-actions">
          <button className="btn btn-primary" onClick={analyzeLink} disabled={analyzing}>
            {analyzing && <span className="spinner" aria-hidden="true" />}
            {analyzing ? 'Analisando site…' : 'Analisar site'}
          </button>
          <button className="btn btn-ghost" onClick={() => goToStep(WIZ_STEPS.findIndex((s) => s.key === 'brief'))} disabled={analyzing}>
            Preencher brief manualmente
          </button>
        </div>
        {analyzing && (
          <div className="link-phase-line">
            <span className="spinner" aria-hidden="true" />
            {analyzePhase >= 0 ? LINK_PHASES[analyzePhase] : 'Preparando…'}
          </div>
        )}
        {analyzing && <div className="await-card">Isso costuma levar <b>~10 segundos</b>. Aguarde enquanto analisamos o site — não é preciso fazer mais nada.</div>}
      </div>

      {/* Step 4: Brief */}
      <div className={`step-panel wide${key === 'brief' ? ' is-active' : ''}`} data-step="brief">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Brief do vídeo</h2>
        <p className="step-sub">Revise os campos abaixo antes de gerar o roteiro. Se vier de um link, ajuste o que parecer errado.</p>
        <div className="brief-grid">
          {BRIEF_FIELDS.map((f) => {
            const isReq = f.key === 'produto' || f.key === 'cta';
            const showErr = isReq && briefAttempted && !wiz.brief[f.key].trim();
            return (
            <label className="field" key={f.key}>
              <span className="l">{f.label}</span>
              {f.area ? (
                <textarea
                  className={showErr ? 'is-invalid' : undefined}
                  placeholder={f.placeholder}
                  value={wiz.brief[f.key]}
                  onChange={(e) => {
                    setWiz((w) => ({ ...w, brief: { ...w.brief, [f.key]: e.target.value } }));
                    if (isReq && e.target.value.trim()) setBriefAttempted(false);
                  }}
                />
              ) : (
                <input
                  type="text"
                  className={showErr ? 'is-invalid' : undefined}
                  placeholder={f.placeholder}
                  value={wiz.brief[f.key]}
                  onChange={(e) => {
                    setWiz((w) => ({ ...w, brief: { ...w.brief, [f.key]: e.target.value } }));
                    if (isReq && e.target.value.trim()) setBriefAttempted(false);
                  }}
                />
              )}
            </label>
            );
          })}
        </div>
        <p className="continue-hint">Ao continuar, vamos gerar o roteiro na próxima etapa — costuma levar <b>~20 segundos</b>. Acompanhe o progresso na tela.</p>
      </div>

      {/* Step 5: Gerando */}
      <div className={`step-panel${key === 'gerando' ? ' is-active' : ''}`} data-step="gerando">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Gerando roteiro</h2>
        <p className="step-sub">Montando tabela técnica, narração para ElevenLabs e sugestão de voz a partir do brief.</p>
        <div className="gerar-stage">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: progress + '%' }} />
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', marginTop: '0.75rem' }}>
            {stage === 'done' ? 'Roteiro pronto. Avançando…' : 'Processando…'}
          </p>
          <div className="progress-log" style={{ marginTop: '1rem' }}>
            {ROTEIRO_STAGES.map((s, i) => {
              const isDone = stage === 'done' || i < roteiroStageIdx;
              const isActive = stage !== 'done' && i === roteiroStageIdx;
              const cls = isDone ? 'done' : isActive ? 'active' : '';
              return (
                <div key={s} className={cls}>
                  {s}
                  {isActive && <span className="thinking-dots"><i /><i /><i /></span>}
                </div>
              );
            })}
          </div>
          <div className="await-card">Aguarde — a geração costuma levar <b>~20 segundos</b> e segue sozinha. Não é preciso clicar nada: ao concluir, você será levado ao roteiro automaticamente.</div>
        </div>
      </div>

      {/* Step 6: Roteiro */}
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
            {key === 'roteiro' && <AudioPreview trackName={trackName} />}
          </div>
        </div>
        <div className="roteiro-actions">
          <button
            className="btn btn-ghost"
            onClick={() => goToStep(WIZ_STEPS.findIndex((s) => s.key === 'brief'))}
            disabled={videoActive}
          >
            Voltar ao brief
          </button>
          <button
            className="btn btn-primary"
            onClick={goNext}
            disabled={videoActive}
          >
            {videoActive
              ? wiz.videoStage === 'assembling'
                ? 'Montando…'
                : 'Gerando…'
              : 'Continuar'}
          </button>
        </div>
      </div>

      {/* Step 7: Preview vídeo */}
      <div className={`step-panel wide${key === 'preview-video' ? ' is-active' : ''}`} data-step="preview-video">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Prévia do vídeo</h2>
        <p className="step-sub">Gerando um clipe por cena e montando o vídeo final. Cada cena pode levar alguns minutos.</p>

        {(() => {
          const renders = wiz.sceneRenders;
          const cenas = roteiro?.cenas || [];
          const total = renders.length;
          const done = renders.filter((r) => r.status === 'concluido').length;
          const failed = renders.filter((r) => r.status === 'falhou').length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const running = wiz.videoStage === 'running' || wiz.videoStage === 'assembling';
          const headline =
            wiz.videoStage === 'assembling'
              ? 'Montando vídeo final…'
              : running
                ? `Gerando cenas — ${done}/${total} prontas`
                : wiz.videoStage === 'done'
                  ? `Vídeo pronto · ${total} ${total === 1 ? 'cena' : 'cenas'}`
                  : wiz.videoStage === 'error'
                    ? 'Falha na geração'
                    : 'Aguardando início…';

          const etaTotal = etaAnchorRef.current?.value ?? etaSeconds ?? 0;
          const etaPct = etaTotal > 0 && etaSeconds != null ? Math.min(1, Math.max(0, etaSeconds / etaTotal)) : 0;

          return (
          <>
            {etaSeconds != null && (
              <div className="video-eta" role="timer" aria-live="polite" aria-label={`Tempo estimado restante: ${formatEta(etaSeconds)}`}>
                <svg className="video-eta-ring" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
                  <circle className="track" cx="18" cy="18" r="15.9155" />
                  <circle className="bar" cx="18" cy="18" r="15.9155" strokeDasharray="100" strokeDashoffset={100 - etaPct * 100} />
                </svg>
                <div>
                  <p className="video-eta-label">
                    {wiz.videoStage === 'assembling' ? 'Tempo estimado até o fim da montagem' : 'Tempo estimado até o fim da geração'}
                  </p>
                  <p className="video-eta-time">{formatEta(etaSeconds)}</p>
                </div>
              </div>
            )}

            {wiz.videoStage === 'assembling' ? (
              <div className="progress-track is-indeterminate" aria-hidden="true">
                <div className="progress-fill" />
              </div>
            ) : total > 0 ? (
              <div className="progress-track">
                <div className="progress-fill" style={{ width: pct + '%' }} />
              </div>
            ) : null}
            <p style={{ fontFamily: 'var(--font-mono)', marginTop: '0.5rem', marginBottom: '1.25rem' }}>{headline}</p>

            {wiz.videoStage === 'assembling' && (
              <div className="await-card" style={{ marginBottom: '1.25rem' }}>
                Montando o vídeo final — costuma levar <b>~45 segundos</b>. Não saia da página.
              </div>
            )}

            {total > 0 && (
              <div className="scene-grid">
                {renders.map((r) => {
                  const cena = cenas.find((c) => c.index === r.index);
                  const statusLabel =
                    r.status === 'pendente' ? 'na fila'
                      : r.status === 'rodando' ? 'gerando'
                        : r.status === 'concluido' ? 'pronta'
                          : 'falhou';
                  const dur = cena?.duration_hint ?? 6;
                  return (
                    <div key={r.index} className={`scene-card is-${r.status}`}>
                      <div className="scene-card-head">
                        <span className="scene-index">Cena {r.index + 1}</span>
                        <span className="scene-pill">{statusLabel}{r.status === 'rodando' && <span className="thinking-dots"><i /><i /><i /></span>}</span>
                      </div>
                      <p className="scene-meta">{cena?.tempo || ''} · {dur}s</p>
                      {cena?.audio_pt && <p className="scene-audio">{cena.audio_pt}</p>}
                      {r.error && <p className="scene-error">{r.error}</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {failed > 0 && total > 0 && failed === total && (
              <div className="roteiro-aviso" style={{ marginTop: '1.25rem' }}>
                <p className="eyebrow">Erro</p>
                <p>
                  {/BLOCKED/i.test(renders.map((r) => r.error || '').join(' '))
                    ? 'A Monid bloqueou esta geração (limite/política). Não reenvie em loop — se já houver um vídeo montado, restaure-o.'
                    : 'Todas as cenas falharam na geração. Veja as mensagens de erro de cada cena acima para o motivo e use os botões abaixo.'}
                </p>
                <div className="roteiro-actions" style={{ marginTop: '1rem' }}>
                  {wiz.finalVideoKey && (
                    <button className="btn btn-primary" type="button" onClick={() => void restoreFinalVideo()}>
                      Restaurar vídeo já gerado
                    </button>
                  )}
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => void startVideoGeneration({ force: true })}
                    disabled={videoActive}
                  >
                    Tentar novamente
                  </button>
                </div>
              </div>
            )}

            {wiz.videoStage === 'error' && wiz.finalVideoKey && failed < total && (
              <div className="roteiro-actions" style={{ marginTop: '1rem' }}>
                <button className="btn btn-primary" type="button" onClick={() => void restoreFinalVideo()}>
                  Restaurar vídeo já gerado
                </button>
              </div>
            )}

            {wiz.videoStage === 'done' && wiz.finalVideoUrl && (
              <div className="preview-stage final-stage" style={{ marginTop: '1.25rem' }}>
                <span className="preview-badge">Pronto</span>
                <video className="final-video" src={wiz.finalVideoUrl} controls playsInline preload="metadata" />
              </div>
            )}

            {(wiz.videoStage === 'idle' || wiz.videoStage === 'error') && total === 0 && key === 'preview-video' && (
              <div className="preview-stage">
                <span className="preview-badge">Prévia · rascunho</span>
                <KineticPreview
                  script={roteiro?.narracao_texto || ''}
                  title={wiz.brief.produto || 'Vídeo'}
                />
              </div>
            )}
          </>
          );
        })()}
      </div>

      {/* Step 8: Preview áudio */}
      <div className={`step-panel${key === 'preview-audio' ? ' is-active' : ''}`} data-step="preview-audio">
        <p className="eyebrow step-eyebrow">{eyebrowText}</p>
        <h2 className="step-title">Prévia do áudio</h2>
        <p className="step-sub">Ouça a narração gerada no ElevenLabs, com a trilha de fundo em volume reduzido.</p>
        {key === 'preview-audio' && (() => {
          const nStage = wiz.narrationStage;
          return (
            <>
              {nStage === 'idle' && (
                <p style={{ fontFamily: 'var(--font-mono)', marginTop: '0.5rem' }}>Aguardando início da geração…</p>
              )}
              {nStage === 'generating' && (
                <div className="gerar-stage">
                  <div className="progress-track is-indeterminate" aria-hidden="true"><div className="progress-fill" /></div>
                  <p style={{ fontFamily: 'var(--font-mono)', marginTop: '0.75rem' }}>Sintetizando narração no ElevenLabs…</p>
                  <div className="await-card">Isso costuma levar <b>~30 segundos</b>. Acompanhe o progresso.</div>
                </div>
              )}
              {nStage === 'error' && (
                <div className="roteiro-aviso">
                  <p className="eyebrow">Erro</p>
                  <p>{wiz.narrationError || 'Falha ao gerar a narração.'}</p>
                  <div className="roteiro-actions" style={{ marginTop: '1rem' }}>
                    <button className="btn btn-primary" type="button" onClick={() => void generateNarration()}>
                      Tentar novamente
                    </button>
                  </div>
                </div>
              )}
              {nStage === 'done' && wiz.narrationUrl && (
                <NarrationAudioPreview narrationUrl={wiz.narrationUrl} trackName={trackName} />
              )}
              {nStage === 'done' && !wiz.narrationUrl && (
                <div className="roteiro-aviso">
                  <p className="eyebrow">Pronto</p>
                  <p>A narração foi gerada, mas o link de reprodução expirou.</p>
                  <div className="roteiro-actions" style={{ marginTop: '1rem' }}>
                    <button className="btn btn-primary" type="button" onClick={() => void reloadNarration()}>
                      Recarregar áudio
                    </button>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Step 9: Exportar */}
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
          <button className="btn btn-ghost" onClick={goBack} hidden={stepIndex === 0} disabled={key === 'preview-video' && videoActive}>Voltar</button>
          <button
            className="btn btn-primary"
            onClick={goNext}
            disabled={key === 'preview-video' && wiz.videoStage !== 'done'}
          >
            {key === 'preview-video' && wiz.videoStage === 'running' ? 'Gerando…' : key === 'preview-video' && wiz.videoStage === 'assembling' ? 'Montando…' : 'Continuar'}
          </button>
        </div>
      )}
    </>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
}

const WAVE_BARS = [18, 28, 38, 52, 66, 44, 30, 24, 42, 58, 74, 48, 34, 26, 52, 67, 78, 48, 32, 42, 62, 72, 54, 36, 28, 48, 68, 76, 58, 40, 28, 50, 64, 74, 46, 32, 42, 58, 70, 52, 34, 26, 46, 62, 76, 56, 38, 30];

function AudioPreview({ trackName }: { trackName: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const audioSrc = TRACK_AUDIO_URLS[trackName as keyof typeof TRACK_AUDIO_URLS] || TRACK_AUDIO_URLS['Ambiente calmo'];
  const bars = WAVE_BARS;
  const progress = duration > 0 ? currentTime / duration : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setHasError(false);
  }, [audioSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const markPlaying = () => setIsPlaying(true);
    const markPaused = () => setIsPlaying(false);
    const finish = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };
    const markError = () => {
      setIsPlaying(false);
      setHasError(true);
    };
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('play', markPlaying);
    audio.addEventListener('pause', markPaused);
    audio.addEventListener('ended', finish);
    audio.addEventListener('error', markError);
    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('play', markPlaying);
      audio.removeEventListener('pause', markPaused);
      audio.removeEventListener('ended', finish);
      audio.removeEventListener('error', markError);
    };
  }, [audioSrc]);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        setHasError(false);
        await audio.play();
      } catch {
        setHasError(true);
      }
    } else {
      audio.pause();
    }
  }

  function seek(value: string) {
    const audio = audioRef.current;
    const nextTime = Number(value);
    if (!audio || !Number.isFinite(nextTime)) return;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <div className="wave-stage">
      <div className="wave-row">
        <button
          className="wave-play"
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pausar prévia' : 'Reproduzir prévia'}
          aria-pressed={isPlaying}
        >
          {isPlaying ? 'Ⅱ' : '▶'}
        </button>
        <div className="wave-bars" aria-hidden="true">
          {bars.map((height, index) => (
            <i key={index} style={{ height: `${height}%` }} className={index / bars.length < progress ? 'is-played' : ''} />
          ))}
        </div>
      </div>
      <input
        className="wave-progress"
        type="range"
        min="0"
        max={duration || 0}
        step="0.01"
        value={Math.min(currentTime, duration || 0)}
        onChange={(event) => seek(event.target.value)}
        disabled={!duration}
        aria-label="Posição da prévia da trilha"
      />
      <div className="wave-meta">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
      {hasError && <p className="wave-error">Não foi possível carregar esta trilha.</p>}
      <audio ref={audioRef} src={audioSrc} preload="metadata" aria-label={`Prévia: ${trackName}`} />
    </div>
  );
}

function NarrationAudioPreview({ narrationUrl, trackName }: { narrationUrl: string; trackName: string }) {
  const narrationRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [trackOn, setTrackOn] = useState(true);
  const trackSrc = TRACK_AUDIO_URLS[trackName as keyof typeof TRACK_AUDIO_URLS] || TRACK_AUDIO_URLS['Ambiente calmo'];
  const bars = WAVE_BARS;
  const progress = duration > 0 ? currentTime / duration : 0;

  useEffect(() => {
    const nar = narrationRef.current;
    const trk = trackRef.current;
    if (!nar || !trk) return;
    nar.pause();
    trk.pause();
    nar.currentTime = 0;
    trk.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setHasError(false);
  }, [narrationUrl, trackSrc]);

  useEffect(() => {
    const nar = narrationRef.current;
    const trk = trackRef.current;
    if (!nar || !trk) return;
    trk.volume = 0.25;
    const updateTime = () => {
      setCurrentTime(nar.currentTime);
      if (Math.abs((trk.currentTime || 0) - (nar.currentTime || 0)) > 0.5) {
        try { trk.currentTime = nar.currentTime; } catch { /* ignore */ }
      }
    };
    const updateDuration = () => setDuration(nar.duration);
    const markPlaying = () => setIsPlaying(true);
    const markPaused = () => setIsPlaying(false);
    const finish = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      nar.currentTime = 0;
      trk.currentTime = 0;
      nar.pause();
      trk.pause();
    };
    const markError = () => {
      setIsPlaying(false);
      setHasError(true);
    };
    nar.addEventListener('timeupdate', updateTime);
    nar.addEventListener('loadedmetadata', updateDuration);
    nar.addEventListener('play', markPlaying);
    nar.addEventListener('pause', markPaused);
    nar.addEventListener('ended', finish);
    nar.addEventListener('error', markError);
    return () => {
      nar.removeEventListener('timeupdate', updateTime);
      nar.removeEventListener('loadedmetadata', updateDuration);
      nar.removeEventListener('play', markPlaying);
      nar.removeEventListener('pause', markPaused);
      nar.removeEventListener('ended', finish);
      nar.removeEventListener('error', markError);
    };
  }, [narrationUrl, trackSrc]);

  async function togglePlay() {
    const nar = narrationRef.current;
    const trk = trackRef.current;
    if (!nar || !trk) return;
    if (nar.paused) {
      try {
        setHasError(false);
        await nar.play();
        if (trackOn) {
          try {
            trk.currentTime = nar.currentTime;
            await trk.play();
          } catch { /* keep narration playing */ }
        }
      } catch {
        setHasError(true);
      }
    } else {
      nar.pause();
      trk.pause();
    }
  }

  function seek(value: string) {
    const nar = narrationRef.current;
    const trk = trackRef.current;
    const nextTime = Number(value);
    if (!nar || !trk || !Number.isFinite(nextTime)) return;
    nar.currentTime = nextTime;
    try { trk.currentTime = nextTime; } catch { /* ignore */ }
    setCurrentTime(nextTime);
  }

  function toggleTrack() {
    const trk = trackRef.current;
    const next = !trackOn;
    setTrackOn(next);
    if (trk) {
      if (next && !(narrationRef.current?.paused ?? true)) {
        try { trk.play(); } catch { /* ignore */ }
      } else {
        trk.pause();
      }
    }
  }

  return (
    <div className="wave-stage">
      <div className="wave-row">
        <button
          className="wave-play"
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pausar prévia' : 'Reproduzir prévia'}
          aria-pressed={isPlaying}
        >
          {isPlaying ? 'Ⅱ' : '▶'}
        </button>
        <div className="wave-bars" aria-hidden="true">
          {bars.map((height, index) => (
            <i key={index} style={{ height: `${height}%` }} className={index / bars.length < progress ? 'is-played' : ''} />
          ))}
        </div>
      </div>
      <input
        className="wave-progress"
        type="range"
        min="0"
        max={duration || 0}
        step="0.01"
        value={Math.min(currentTime, duration || 0)}
        onChange={(event) => seek(event.target.value)}
        disabled={!duration}
        aria-label="Posição da prévia da narração"
      />
      <div className="wave-meta">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
      <div className="wave-options">
        <label className="wave-track-toggle">
          <input type="checkbox" checked={trackOn} onChange={toggleTrack} />
          <span>Trilha de fundo</span>
        </label>
      </div>
      {hasError && <p className="wave-error">Não foi possível carregar o áudio da narração.</p>}
      <audio ref={narrationRef} src={narrationUrl} preload="metadata" aria-label="Narração" />
      <audio ref={trackRef} src={trackSrc} loop preload="metadata" aria-label={`Trilha: ${trackName}`} />
    </div>
  );
}
