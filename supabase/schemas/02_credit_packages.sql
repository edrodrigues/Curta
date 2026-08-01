-- credit_packages with seed (bronze/prata/ouro)
-- Build guide §5: Bronze 5/R$110, Prata 10/R$210 (featured), Ouro 20/R$380

create table if not exists public.credit_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  credits integer not null,
  price_cents integer not null,
  is_featured boolean not null default false
);

insert into public.credit_packages (slug, credits, price_cents, is_featured) values
  ('bronze', 5,  11000, false),
  ('prata',  10, 21000, true),
  ('ouro',   20, 38000, false)
on conflict (slug) do nothing;