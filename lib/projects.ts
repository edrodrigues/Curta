import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { Database, Json } from '@/lib/database.types';
import { emptyBrief, type Brief, type NarrationStage, type Project, type ProjectStatus, type RoteiroOutput, type SceneRender, type VideoFormatKey, type VideoStage, type WizardData } from '@/lib/types';

type ProjectsRow = Database['public']['Tables']['projects']['Row'];
type ProjectsInsert = Database['public']['Tables']['projects']['Insert'];
type ProjectsUpdate = Database['public']['Tables']['projects']['Update'];

export type WizardState = {
  stepIndex: number;
  estiloId: string;
  estiloNome: string;
  trilhaNome: string;
  tabela_md: string;
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
};

export type ProjectExtras = {
  estiloId: string;
  estiloNome: string;
  trilhaNome: string;
  tabela_md: string;
  titulo?: string;
};

export function wizardStateFromWizard(wiz: WizardData, stepIndex: number, extras: ProjectExtras): WizardState {
  return {
    stepIndex,
    estiloId: extras.estiloId,
    estiloNome: extras.estiloNome,
    trilhaNome: extras.trilhaNome,
    tabela_md: extras.tabela_md,
    link: wiz.link,
    duration: wiz.duration,
    videoFormat: wiz.videoFormat,
    brief: wiz.brief,
    roteiro: wiz.roteiro,
    sceneRenders: wiz.sceneRenders,
    finalVideoUrl: wiz.finalVideoUrl,
    finalVideoKey: wiz.finalVideoKey,
    videoStage: wiz.videoStage,
    videoCostEstimateUsd: wiz.videoCostEstimateUsd,
    narrationStage: wiz.narrationStage,
    narrationRunId: wiz.narrationRunId,
    narrationKey: wiz.narrationKey,
    narrationUrl: wiz.narrationUrl,
    narrationError: wiz.narrationError,
  };
}

export function wizardFromState(ws: WizardState | null, row: ProjectsRow): { wizard: WizardData; stepIndex: number } {
  const wizard: WizardData = {
    link: ws?.link ?? row.link_origem ?? '',
    duration: (ws?.duration ?? (row.duracao_segundos as 30 | 60 | null)) ?? null,
    videoFormat: (ws?.videoFormat ?? (row.video_format as VideoFormatKey | null)) ?? null,
    brief: ws?.brief ?? { ...emptyBrief },
    roteiro: ws?.roteiro ?? null,
    sceneRenders: ws?.sceneRenders ?? [],
    finalVideoUrl: ws?.finalVideoUrl ?? row.video_url ?? null,
    finalVideoKey: ws?.finalVideoKey ?? null,
    videoStage: ws?.videoStage ?? 'idle',
    videoCostEstimateUsd: ws?.videoCostEstimateUsd ?? null,
    narrationStage: ws?.narrationStage ?? 'idle',
    narrationRunId: ws?.narrationRunId ?? null,
    narrationKey: ws?.narrationKey ?? null,
    narrationUrl: ws?.narrationUrl ?? null,
    narrationError: ws?.narrationError ?? null,
  };
  return { wizard, stepIndex: ws?.stepIndex ?? 0 };
}

export function rowToProject(row: ProjectsRow): Project {
  const ws = (row.wizard_state as WizardState | null) ?? null;
  return {
    id: row.id,
    titulo: row.titulo ?? '',
    roteiro: row.roteiro ?? '',
    tabela_md: ws?.tabela_md,
    duracao: (row.duracao_segundos ?? 30) as 30 | 60,
    videoFormat: (row.video_format ?? undefined) as VideoFormatKey | undefined,
    estiloId: ws?.estiloId ?? '',
    estiloNome: row.estilo_narracao ?? ws?.estiloNome ?? '',
    trilhaNome: row.estilo_trilha ?? ws?.trilhaNome ?? '',
    status: row.status as ProjectStatus,
    createdAt: row.created_at.slice(0, 10),
    videoUrl: row.video_url ?? undefined,
  };
}

function serializeWizard(wiz: WizardData, stepIndex: number, extras: ProjectExtras): Json {
  return wizardStateFromWizard(wiz, stepIndex, extras) as unknown as Json;
}

export async function listProjects(): Promise<Project[]> {
  const supabase = createSupabaseBrowser();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToProject);
}

export async function loadProject(id: string): Promise<{ project: Project; wizard: WizardData; stepIndex: number; updated_at: string } | null> {
  const supabase = createSupabaseBrowser();
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).single();
  if (error || !data) return null;
  const project = rowToProject(data);
  const ws = (data.wizard_state as WizardState | null) ?? null;
  const { wizard, stepIndex } = wizardFromState(ws, data);
  return { project, wizard, stepIndex, updated_at: data.updated_at };
}

export async function createProject(user_id: string, input: { wizard: WizardData; stepIndex: number; extras: ProjectExtras }): Promise<{ id: string; updated_at: string } | null> {
  const supabase = createSupabaseBrowser();
  const insert: ProjectsInsert = {
    user_id,
    titulo: (input.extras.titulo || input.wizard.brief.produto) || null,
    link_origem: input.wizard.link || null,
    roteiro: input.wizard.roteiro?.narracao_texto || null,
    duracao_segundos: input.wizard.duration ?? null,
    estilo_narracao: input.extras.estiloNome || null,
    estilo_trilha: input.extras.trilhaNome || null,
    video_format: input.wizard.videoFormat ?? null,
    status: 'rascunho',
    wizard_state: serializeWizard(input.wizard, input.stepIndex, input.extras),
  };
  const { data, error } = await supabase.from('projects').insert(insert).select('id, updated_at').single();
  if (error || !data) return null;
  return { id: data.id, updated_at: data.updated_at };
}

export type UpdateProjectResult =
  | { ok: true; updated_at: string }
  | { ok: false; reason: 'stale' | 'error'; message?: string };

export async function updateProject(
  id: string,
  input: { wizard: WizardData; stepIndex: number; extras: ProjectExtras },
  opts?: { expectedUpdatedAt?: string | null }
): Promise<UpdateProjectResult> {
  const supabase = createSupabaseBrowser();

  if (opts?.expectedUpdatedAt) {
    const { data: current } = await supabase
      .from('projects')
      .select('wizard_state, updated_at')
      .eq('id', id)
      .single();
    if (current && current.updated_at !== opts.expectedUpdatedAt) {
      return { ok: false, reason: 'stale' };
    }
    const serverWs = (current?.wizard_state as WizardState | null) ?? null;
    const client = input.wizard;
    if (
      serverWs?.videoStage === 'done' &&
      serverWs.finalVideoKey &&
      client.videoStage === 'error' &&
      !client.finalVideoKey
    ) {
      return { ok: false, reason: 'stale', message: 'Servidor tem vídeo pronto; save local descartado.' };
    }
  }

  const update: ProjectsUpdate = {
    titulo: (input.extras.titulo || input.wizard.brief.produto) || null,
    link_origem: input.wizard.link || null,
    roteiro: input.wizard.roteiro?.narracao_texto || null,
    duracao_segundos: input.wizard.duration ?? null,
    estilo_narracao: input.extras.estiloNome || null,
    estilo_trilha: input.extras.trilhaNome || null,
    video_format: input.wizard.videoFormat ?? null,
    wizard_state: serializeWizard(input.wizard, input.stepIndex, input.extras),
  };

  let q = supabase.from('projects').update(update).eq('id', id);
  if (opts?.expectedUpdatedAt) {
    q = q.eq('updated_at', opts.expectedUpdatedAt);
  }
  const { data, error } = await q.select('updated_at').maybeSingle();
  if (error) return { ok: false, reason: 'error', message: error.message };
  if (!data) return { ok: false, reason: 'stale' };
  return { ok: true, updated_at: data.updated_at };
}

export async function updateProjectStatus(id: string, status: ProjectStatus, extra?: { video_url?: string; audio_url?: string; credits_charged?: number }): Promise<void> {
  const supabase = createSupabaseBrowser();
  const update: ProjectsUpdate = { status, ...extra };
  const { error } = await supabase.from('projects').update(update).eq('id', id);
  if (error) throw error;
}

export async function deleteProjectDb(id: string): Promise<void> {
  const supabase = createSupabaseBrowser();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function duplicateProjectDb(id: string): Promise<string | null> {
  const supabase = createSupabaseBrowser();
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).single();
  if (error || !data) return null;
  const { id: _omit, created_at: _c, updated_at: _u, ...rest } = data;
  const insert: ProjectsInsert = {
    ...rest,
    titulo: (data.titulo ?? 'Projeto') + ' (cópia)',
    status: 'rascunho',
  };
  const { data: inserted, error: insErr } = await supabase.from('projects').insert(insert).select('id').single();
  if (insErr || !inserted) return null;
  return inserted.id;
}