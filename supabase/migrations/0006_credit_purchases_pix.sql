-- =========================================================
-- Credit purchases (PIX / Mercado Pago)
-- =========================================================
begin;

create table if not exists public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credits integer not null check (credits > 0),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL',
  provider text not null default 'mercadopago',
  provider_payment_id text unique,
  status text not null default 'pending',
  qr_code text null,
  qr_code_base64 text null,
  metadata jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz null
);

create index if not exists credit_purchases_user_id_created_at_idx
  on public.credit_purchases (user_id, created_at desc);

create index if not exists credit_purchases_provider_payment_id_idx
  on public.credit_purchases (provider_payment_id);

alter table public.credit_purchases enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'credit_purchases'
      and policyname = 'credit_purchases_select_own'
  ) then
    execute $p$
      create policy credit_purchases_select_own
      on public.credit_purchases
      for select
      using (user_id = auth.uid());
    $p$;
  end if;
end $$;

grant select on public.credit_purchases to authenticated;

commit;
