-- RLS policies on every public table
-- Build guide §3.4 / §13

-- profiles: owner read/update own row
alter table public.profiles enable row level security;

drop policy if exists "profiles_owner_select" on public.profiles;
create policy "profiles_owner_select" on public.profiles
  for select to authenticated
  using ( (select auth.uid()) = id );

drop policy if exists "profiles_owner_update" on public.profiles;
create policy "profiles_owner_update" on public.profiles
  for update to authenticated
  using ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

-- credit_wallets: owner read only (writes via service_role RPC)
alter table public.credit_wallets enable row level security;

drop policy if exists "wallets_owner_select" on public.credit_wallets;
create policy "wallets_owner_select" on public.credit_wallets
  for select to authenticated
  using ( (select auth.uid()) = user_id );

-- credit_transactions: owner read only (inserts via service_role RPC / trigger)
alter table public.credit_transactions enable row level security;

drop policy if exists "transactions_owner_select" on public.credit_transactions;
create policy "transactions_owner_select" on public.credit_transactions
  for select to authenticated
  using ( (select auth.uid()) = user_id );

-- credit_packages: public read (anon + authenticated)
alter table public.credit_packages enable row level security;

drop policy if exists "packages_public_select" on public.credit_packages;
create policy "packages_public_select" on public.credit_packages
  for select to anon, authenticated
  using ( true );

-- orders: owner read only (inserts/updates via service_role server-side)
alter table public.orders enable row level security;

drop policy if exists "orders_owner_select" on public.orders;
create policy "orders_owner_select" on public.orders
  for select to authenticated
  using ( (select auth.uid()) = user_id );

-- projects: full owner CRUD
alter table public.projects enable row level security;

drop policy if exists "projects_owner_select" on public.projects;
create policy "projects_owner_select" on public.projects
  for select to authenticated
  using ( (select auth.uid()) = user_id );

drop policy if exists "projects_owner_insert" on public.projects;
create policy "projects_owner_insert" on public.projects
  for insert to authenticated
  with check ( (select auth.uid()) = user_id );

drop policy if exists "projects_owner_update" on public.projects;
create policy "projects_owner_update" on public.projects
  for update to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

drop policy if exists "projects_owner_delete" on public.projects;
create policy "projects_owner_delete" on public.projects
  for delete to authenticated
  using ( (select auth.uid()) = user_id );

-- render_jobs: owner read only (writes via service_role Edge Functions).
-- Joins to projects via project_id to enforce ownership, since render_jobs
-- has no direct user_id column.
alter table public.render_jobs enable row level security;

drop policy if exists "render_jobs_owner_select" on public.render_jobs;
create policy "render_jobs_owner_select" on public.render_jobs
  for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = render_jobs.project_id
      and p.user_id = (select auth.uid())
    )
  );

-- credit_coupons and coupon_redemptions RLS is enabled inline in
-- 10_credit_coupons.sql / 11_coupon_redemptions.sql, since those tables are
-- created after this file in schema_paths (db.migrations order matters for
-- a from-scratch rebuild).