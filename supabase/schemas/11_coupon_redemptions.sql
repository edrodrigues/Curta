-- coupon_redemptions: one row per (coupon, user) redemption.
-- The unique constraint prevents a single user from redeeming the same
-- coupon more than once. Written only by public.redeem_coupon (12_redeem_coupon.sql)
-- via the service-role client — see app/api/cupons/redeem/route.ts.

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.credit_coupons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  credits integer not null,
  created_at timestamptz not null default now(),
  unique (coupon_id, user_id)
);

create index if not exists coupon_redemptions_user_id_idx on public.coupon_redemptions (user_id);

-- RLS enabled with no policies: only public.redeem_coupon (service_role
-- execute only, see 12_redeem_coupon.sql) writes here.
alter table public.coupon_redemptions enable row level security;
