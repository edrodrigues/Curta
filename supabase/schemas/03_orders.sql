-- orders (InfinitePay purchase lifecycle)
-- Build guide §3.1 / §6

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_nsu text not null unique,
  kind text not null check (kind in ('package','topup')),
  package_slug text,
  amount_cents integer not null,
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  infinitepay_invoice_slug text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists orders_user_id_created_at_idx
  on public.orders (user_id, created_at desc);