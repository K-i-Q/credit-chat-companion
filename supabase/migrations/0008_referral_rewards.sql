-- =========================================================
-- Referral coupons + rewards
-- =========================================================
begin;

create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists referral_codes_code_idx
  on public.referral_codes (code);

insert into public.referral_codes (user_id, code)
select
  u.id,
  'mx' || substring(replace(u.id::text, '-', ''), 1, 8)
from auth.users u
on conflict (user_id) do nothing;

create table if not exists public.referral_redemptions (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz null,
  purchase_id uuid null references public.credit_purchases(id) on delete set null,
  unique (referred_user_id)
);

create index if not exists referral_redemptions_referrer_idx
  on public.referral_redemptions (referrer_user_id);

alter table public.referral_codes enable row level security;
alter table public.referral_redemptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_codes'
      and policyname = 'referral_codes_select_own'
  ) then
    execute $p$
      create policy referral_codes_select_own
      on public.referral_codes
      for select
      using (user_id = auth.uid());
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_redemptions'
      and policyname = 'referral_redemptions_select_own'
  ) then
    execute $p$
      create policy referral_redemptions_select_own
      on public.referral_redemptions
      for select
      using (referrer_user_id = auth.uid() or referred_user_id = auth.uid());
    $p$;
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  insert into public.profiles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;

  insert into public.credit_wallets (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  v_code := 'mx' || substring(replace(new.id::text, '-', ''), 1, 8);
  insert into public.referral_codes (user_id, code)
  values (new.id, v_code)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function public.ensure_user_bootstrap()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  insert into public.profiles (user_id, role)
  values (auth.uid(), 'user')
  on conflict (user_id) do nothing;

  insert into public.credit_wallets (user_id, balance)
  values (auth.uid(), 0)
  on conflict (user_id) do nothing;

  v_code := 'mx' || substring(replace(auth.uid()::text, '-', ''), 1, 8);
  insert into public.referral_codes (user_id, code)
  values (auth.uid(), v_code)
  on conflict (user_id) do nothing;
end;
$$;

commit;
