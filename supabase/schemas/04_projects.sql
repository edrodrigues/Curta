-- projects (user videos)
-- Build guide §3.1 / §9
-- estilo_narracao / estilo_trilha store the label text directly (build guide §3.1).
-- audio_url / video_url / srt_url hold Storage paths (not public URLs) per §8.2.
-- wizard_state jsonb persists the full WizardData so a user can resume editing.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text,
  link_origem text,
  roteiro text,
  duracao_segundos integer check (duracao_segundos in (30,60)),
  estilo_narracao text,
  estilo_trilha text,
  video_format text,
  status text not null default 'rascunho' check (status in ('rascunho','processando','pronto','erro')),
  wizard_state jsonb,
  audio_url text,
  video_url text,
  srt_url text,
  credits_charged integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at maintenance trigger
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create index if not exists projects_user_id_created_at_idx
  on public.projects (user_id, created_at desc);
create index if not exists projects_user_id_updated_at_idx
  on public.projects (user_id, updated_at desc);