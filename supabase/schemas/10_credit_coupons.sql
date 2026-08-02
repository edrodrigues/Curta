-- credit_coupons: admin-managed coupon codes redeemable for credits
-- Management restricted to a single admin email, enforced in app/api/cupons
-- (see lib/require-admin.ts) — not by RLS/role, since there is no per-user
-- role system in this project. All access goes through the service-role
-- client, so RLS stays enabled with zero policies (see 08_rls_policies.sql).

create table if not exists public.credit_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  credits integer not null check (credits > 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemptions_count integer not null default 0,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists credit_coupons_code_idx on public.credit_coupons (code);

-- RLS enabled with no policies for anon/authenticated: only the service-role
-- client (app/api/cupons, gated to a single admin email) can read/write.
alter table public.credit_coupons enable row level security;
