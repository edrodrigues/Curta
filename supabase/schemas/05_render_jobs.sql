-- render_jobs (async job tracking for Monid runs)
-- Build guide §3.1 / §8.3 / §11

create table if not exists public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('scene_clip','narracao','trilha')),
  scene_index integer,
  stage text not null check (stage in ('pendente','em_andamento','concluido','falhou')),
  monid_run_id text,
  provider text,
  endpoint text,
  input jsonb,
  output jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at maintenance trigger
drop trigger if exists render_jobs_set_updated_at on public.render_jobs;
create trigger render_jobs_set_updated_at
  before update on public.render_jobs
  for each row execute function public.set_updated_at();

create index if not exists render_jobs_project_id_idx
  on public.render_jobs (project_id);
create index if not exists render_jobs_stage_idx
  on public.render_jobs (stage)
  where stage = 'em_andamento';