alter table public.external_connections
  add column if not exists disconnect_requested_at timestamptz null,
  add column if not exists provider_access_ended_at timestamptz null,
  add column if not exists disconnected_at timestamptz null,
  add column if not exists history_retention text null;

alter table public.external_connections
  drop constraint if exists external_connections_history_retention_check;

alter table public.external_connections
  add constraint external_connections_history_retention_check
  check (
    history_retention is null
    or history_retention in ('kept', 'deleted')
  );

create index if not exists external_connections_household_status_idx
  on public.external_connections (household_id, status);

create index if not exists external_connections_disconnected_at_idx
  on public.external_connections (household_id, disconnected_at)
  where disconnected_at is not null;

create table public.source_lifecycle_jobs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  connection_id uuid not null references public.external_connections(id) on delete restrict,
  requested_by uuid null references auth.users(id) on delete set null,
  provider text not null,
  action text not null check (
    action in ('disconnect_keep_history')
  ),
  retain_history boolean not null default true,
  status text not null default 'queued' check (
    status in (
      'queued',
      'processing',
      'succeeded',
      'failed',
      'support_required'
    )
  ),
  idempotency_key uuid not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  next_attempt_at timestamptz null,
  started_at timestamptz null,
  completed_at timestamptz null,
  failed_at timestamptz null,
  error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, requested_by, idempotency_key)
);

create unique index source_lifecycle_jobs_one_active_disconnect_idx
  on public.source_lifecycle_jobs (connection_id, action)
  where status in ('queued', 'processing');

create index source_lifecycle_jobs_ready_idx
  on public.source_lifecycle_jobs (status, next_attempt_at, created_at);

create index source_lifecycle_jobs_household_idx
  on public.source_lifecycle_jobs (household_id, created_at desc);

alter table public.source_lifecycle_jobs enable row level security;

create policy source_lifecycle_jobs_select_household_owner
  on public.source_lifecycle_jobs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members household_member
      where household_member.household_id = source_lifecycle_jobs.household_id
        and household_member.user_id = auth.uid()
        and household_member.role = 'owner'
    )
  );

create policy source_lifecycle_jobs_insert_household_owner
  on public.source_lifecycle_jobs
  for insert
  to authenticated
  with check (
    requested_by = auth.uid()
    and exists (
      select 1
      from public.household_members household_member
      where household_member.household_id = source_lifecycle_jobs.household_id
        and household_member.user_id = auth.uid()
        and household_member.role = 'owner'
    )
    and exists (
      select 1
      from public.external_connections connection
      where connection.id = source_lifecycle_jobs.connection_id
        and connection.household_id = source_lifecycle_jobs.household_id
    )
  );
