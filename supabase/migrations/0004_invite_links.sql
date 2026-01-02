-- =========================================================
-- Invite links for onboarding credits
-- =========================================================
begin;

create table if not exists public.invite_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  credits integer not null check (credits > 0),
  active boolean not null default true,
  uses_count integer not null default 0 check (uses_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz null
);

create index if not exists invite_links_code_idx
  on public.invite_links (code);

create table if not exists public.invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invite_links(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (invite_id, user_id)
);

create index if not exists invite_redemptions_user_id_idx
  on public.invite_redemptions (user_id);

alter table public.invite_links enable row level security;
alter table public.invite_redemptions enable row level security;

commit;
