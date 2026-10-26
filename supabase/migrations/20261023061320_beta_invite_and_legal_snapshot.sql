-- Typed-household beta: record invite acceptance and the legal text someone accepted.

create table if not exists public.beta_access (
  user_id uuid primary key,
  method text not null check (method in ('invite_code', 'allowlist')),
  granted_at timestamptz not null default now()
);

alter table public.beta_access enable row level security;

drop policy if exists beta_access_select_own on public.beta_access;
create policy beta_access_select_own
  on public.beta_access
  for select
  to authenticated
  using (user_id = auth.uid());

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  content_sha256 text not null,
  content_snapshot text not null,
  signed_name text not null,
  accepted_at timestamptz not null default now()
);

create index if not exists legal_acceptances_user_accepted_idx
  on public.legal_acceptances (user_id, accepted_at desc);

alter table public.legal_acceptances enable row level security;

drop policy if exists legal_acceptances_select_own on public.legal_acceptances;
create policy legal_acceptances_select_own
  on public.legal_acceptances
  for select
  to authenticated
  using (user_id = auth.uid());

-- profiles already exists in the hosted database. These columns record the
-- typed-beta confirmations. AI Ask stays off until ai_ask_opt_in_at is set.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    alter table public.profiles
      add column if not exists confirmed_adult boolean not null default false,
      add column if not exists confirmed_au_resident boolean not null default false,
      add column if not exists onboarding_completed_at timestamptz,
      add column if not exists ai_ask_opt_in_at timestamptz;
  end if;
end $$;
