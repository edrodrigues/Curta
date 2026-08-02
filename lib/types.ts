export type ProjectStatus = 'rascunho' | 'processando' | 'pronto' | 'erro';

export type VideoFormatKey =
  | 'yt-long'
  | 'yt-shorts'
  | 'ig-reels'
  | 'ig-feed-45'
  | 'ig-feed-11'
  | 'li-vertical'
  | 'li-horizontal';

export type VideoFormat = {
  key: VideoFormatKey;
  grupo: 'YouTube' | 'Instagram' | 'LinkedIn';
  titulo: string;
  aspecto: string;
  resolucao: string;
  descricao: string;
};

export const VIDEO_FORMATS: VideoFormat[] = [
  {
    key: 'yt-long',
    grupo: 'YouTube',
    titulo: 'Vídeos Longos (Padrão)',
    aspecto: '16:9',
    resolucao: '1920×1080 px',
    descricao: 'Ideal para tutoriais, vlogs, entrevistas e conteúdos aprofundados.',
  },
  {
    key: 'yt-shorts',
    grupo: 'YouTube',
    titulo: 'YouTube Shorts',
    aspecto: '9:16',
    resolucao: '1080×1920 px',
    descricao: 'Vertical, até 60 segundos, focado em descoberta rápida.',
  },
  {
    key: 'ig-reels',
    grupo: 'Instagram',
    titulo: 'Reels e Stories',
    aspecto: '9:16',
    resolucao: '1080×1920 px',
    descricao: 'Tela cheia vertical, essencial para o consumo móvel e alcance orgânico.',
  },
  {
    key: 'ig-feed-45',
    grupo: 'Instagram',
    titulo: 'Feed Tradicional (Retrato)',
    aspecto: '4:5',
    resolucao: '1080×1350 px',
    descricao: 'Ocupa mais tela no feed móvel em formato retrato.',
  },
  {
    key: 'ig-feed-11',
    grupo: 'Instagram',
    titulo: 'Feed Tradicional (Quadrado)',
    aspecto: '1:1',
    resolucao: '1080×1080 px',
    descricao: 'O clássico quadrado, imune ao recorte do feed.',
  },
  {
    key: 'li-vertical',
    grupo: 'LinkedIn',
    titulo: 'Vídeo Nativo Vertical',
    aspecto: '9:16',
    resolucao: '1080×1920 px',
    descricao: 'Vertical em tela cheia, para consumo móvel no feed profissional.',
  },
  {
    key: 'li-horizontal',
    grupo: 'LinkedIn',
    titulo: 'Vídeo Nativo Horizontal',
    aspecto: '16:9',
    resolucao: '1920×1080 / 1080×1080 px',
    descricao: 'Horizontal 16:9 ou quadrado 1:1, com duração recomendada de 30 ou 60 segundos para capturar a atenção no feed profissional.',
  },
];

export type Project = {
  id: string;
  titulo: string;
  roteiro: string;
  tabela_md?: string;
  duracao: 30 | 60;
  videoFormat?: VideoFormatKey;
  estiloId: string;
  estiloNome: string;
  trilhaNome: string;
  status: ProjectStatus;
  createdAt: string;
  videoUrl?: string;
};

export type StoreState = {
  credits: number;
};

export type Brief = {
  produto: string;
  publico_alvo: string;
  objetivo: string;
  tom: string;
  idioma: string;
  cta: string;
  estilo_visual: string;
  referencias: string;
};

export type RoteiroVoz = {
  estilo: string;
  estabilidade: string;
  exaggeration: string;
  raw: string;
};

export type Cena = {
  index: number;
  tempo: string;
  video_pt: string;
  audio_pt: string;
  prompt_en: string;
  duration_hint: 6 | 10;
};

export type RoteiroOutput = {
  tabela_md: string;
  narracao_texto: string;
  voz: RoteiroVoz;
  trilha_mood: string;
  aviso?: string;
  cenas: Cena[];
};

export type SceneRenderStatus = 'pendente' | 'rodando' | 'concluido' | 'falhou';
export type SceneRender = {
  index: number;
  status: SceneRenderStatus;
  run_id?: string;
  clip_url?: string;
  error?: string;
};
export type VideoStage = 'idle' | 'running' | 'assembling' | 'done' | 'error';
export type NarrationStage = 'idle' | 'generating' | 'done' | 'error';
export type ExportStage = 'idle' | 'running' | 'done' | 'error';

export type WizardData = {
  link: string;
  duration: 30 | 60 | null;
  videoFormat: VideoFormatKey | null;
  brief: Brief;
  roteiro: RoteiroOutput | null;
  sceneRenders: SceneRender[];
  finalVideoUrl: string | null;
  finalVideoKey: string | null;
  videoStage: VideoStage;
  videoCostEstimateUsd: number | null;
  narrationStage: NarrationStage;
  narrationRunId: string | null;
  narrationKey: string | null;
  narrationUrl: string | null;
  narrationError: string | null;
  exportStage: ExportStage;
  exportError: string | null;
};

export const emptyBrief: Brief = {
  produto: '',
  publico_alvo: '',
  objetivo: '',
  tom: '',
  idioma: 'pt-BR',
  cta: '',
  estilo_visual: '',
  referencias: '',
};

export const STYLES = [
  { id: 'didatica', nome: 'Didática', desc: 'Clara e pausada — ideal para tutoriais.' },
  { id: 'entusiasmada', nome: 'Entusiasmada', desc: 'Dinâmica e envolvente — ideal para lançamentos.' },
  { id: 'institucional', nome: 'Institucional', desc: 'Firme e confiável — ideal para apresentações.' },
  { id: 'descontraida', nome: 'Descontraída', desc: 'Leve e próxima — ideal para redes sociais.' },
] as const;

export const TRACKS = ['Ambiente calmo', 'Corporativo', 'Upbeat', 'Cinematográfico'] as const;

export const TRACK_AUDIO_URLS: Record<(typeof TRACKS)[number], string> = {
  'Ambiente calmo': '/audio/ambiente-calmo.wav',
  Corporativo: '/audio/corporativo.wav',
  Upbeat: '/audio/upbeat.wav',
  Cinematográfico: '/audio/cinematografico.wav',
};

export const PACKAGES = [
  { slug: 'bronze', credits: 5, price: 110, save: 15, featured: false },
  { slug: 'prata', credits: 10, price: 210, save: 40, featured: true },
  { slug: 'ouro', credits: 20, price: 380, save: 120, featured: false },
] as const;

export function statusLabel(s: ProjectStatus): string {
  if (s === 'pronto') return 'Pronto';
  if (s === 'processando') return 'Processando';
  if (s === 'erro') return 'Erro';
  return 'Rascunho';
}

export function slugify(s: string): string {
  return (
    (s || 'video')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'video'
  );
}

export function genId(): string {
  return 'p' + Date.now().toString(16) + Math.random().toString(16).slice(2);
}

export function matchStyle(voiceStyle: string): { id: string; nome: string } {
  const v = (voiceStyle || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/energ|entusias|dinam|upbeat|animad/.test(v)) {
    return { id: 'entusiasmada', nome: 'Entusiasmada' };
  }
  if (/calm|pausad|didatic|tutorial|didatic|explicat/.test(v)) {
    return { id: 'didatica', nome: 'Didática' };
  }
  if (/corporat|institucional|firm|confiavel|serio/.test(v)) {
    return { id: 'institucional', nome: 'Institucional' };
  }
  if (/descontraid|leve|proxim|jovem|social|conversa/.test(v)) {
    return { id: 'descontraida', nome: 'Descontraída' };
  }
  return { id: 'didatica', nome: 'Didática' };
}

export function matchTrack(mood: string): string {
  const m = (mood || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/calm|suave|tranquil|ambient|soft|delicad|sereno|leve/.test(m)) return 'Ambiente calmo';
  if (/corporat|institucional|profission|serio|confian/.test(m)) return 'Corporativo';
  if (/upbeat|energ|animad|vibrant|dinam|festiv|alegr|up ?tempo/.test(m)) return 'Upbeat';
  if (/cinematogr|cinelico|epico|dramatic|impact|intens|narrativ/.test(m)) return 'Cinematográfico';
  return TRACKS[0];
}
