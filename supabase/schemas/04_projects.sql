-- projects (user videos)
-- Build guide §3.1 / §9
-- estilo_narracao / estilo_trilha store the label text directly (build guide §3.1).
-- audio_url / video_url / srt_url hold Storage paths (not public URLs) per §8.2.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text,
  link_origem text,
  roteiro text not null,
  duracao_segundos integer not null check (duracao_segundos in (30,60)),
  estilo_narracao text,
  estilo_trilha text,
  status text not null default 'rascunho' check (status in ('rascunho','processando','pronto','erro')),
  audio_url text,
  video_url text,
  srt_url text,
  credits_charged integer,
  created_at timestamptz not null default now()
);

create index if not exists projects_user_id_created_at_idx
  on public.projects (user_id, created_at desc);