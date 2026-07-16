-- Store household decisions about detected transaction patterns.

create table public.transaction_pattern_confirmations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  pattern_key text not null,
  kind text not null check (kind in ('bill', 'income', 'transfer', 'ignore')),
  label text null,
  amount_cents bigint null,
  currency text not null default 'AUD',
  cadence text null,
  confidence text null,
  source_provider text null,
  first_seen_at timestamptz null,
  last_seen_at timestamptz null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_pattern_confirmations_household_pattern_key_key
    unique (household_id, pattern_key)
);

create index transaction_pattern_confirmations_household_kind_idx
  on public.transaction_pattern_confirmations (household_id, kind);

create index transaction_pattern_confirmations_household_updated_idx
  on public.transaction_pattern_confirmations (household_id, updated_at desc);

alter table public.transaction_pattern_confirmations enable row level security;

create policy transaction_pattern_confirmations_select_household_member
  on public.transaction_pattern_confirmations
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy transaction_pattern_confirmations_insert_household_editor
  on public.transaction_pattern_confirmations
  for insert
  to authenticated
  with check (
    public.is_household_owner_or_editor(household_id)
    and created_by = auth.uid()
  );

create policy transaction_pattern_confirmations_update_household_editor
  on public.transaction_pattern_confirmations
  for update
  to authenticated
  using (public.is_household_owner_or_editor(household_id))
  with check (public.is_household_owner_or_editor(household_id));

create policy transaction_pattern_confirmations_delete_household_editor
  on public.transaction_pattern_confirmations
  for delete
  to authenticated
  using (public.is_household_owner_or_editor(household_id));
