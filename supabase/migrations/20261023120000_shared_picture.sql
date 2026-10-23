-- Shared household picture, in-app reminders, waitlist, and usage counts.

create table if not exists public.household_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  created_by uuid not null,
  updated_by uuid null,
  kind text not null check (kind in ('bill', 'renewal', 'income', 'note')),
  title text not null,
  amount_cents bigint null,
  currency text not null default 'AUD',
  due_on date null,
  notes text null,
  assignee_user_id uuid null,
  source text not null default 'manual' check (source in ('manual', 'brain_dump')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists household_items_household_due_idx
  on public.household_items (household_id, due_on);

create table if not exists public.household_reminders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  item_id uuid null,
  created_by uuid not null,
  assignee_user_id uuid null,
  title text not null,
  remind_on date not null,
  created_at timestamptz not null default now()
);

create index if not exists household_reminders_household_date_idx
  on public.household_reminders (household_id, remind_on);

create table if not exists public.household_reminder_reads (
  reminder_id uuid not null,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (reminder_id, user_id)
);

create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now(),
  constraint waitlist_signups_email_key unique (email)
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid null,
  household_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_name_created_idx
  on public.usage_events (event_name, created_at desc);

create index if not exists usage_events_household_created_idx
  on public.usage_events (household_id, created_at desc);

alter table public.household_items enable row level security;
alter table public.household_reminders enable row level security;
alter table public.household_reminder_reads enable row level security;
alter table public.waitlist_signups enable row level security;
alter table public.usage_events enable row level security;

drop policy if exists household_items_member on public.household_items;
create policy household_items_member
  on public.household_items
  for all
  to authenticated
  using (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = household_items.household_id
        and hm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = household_items.household_id
        and hm.user_id = auth.uid()
    )
  );

drop policy if exists household_reminders_member on public.household_reminders;
create policy household_reminders_member
  on public.household_reminders
  for all
  to authenticated
  using (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = household_reminders.household_id
        and hm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = household_reminders.household_id
        and hm.user_id = auth.uid()
    )
  );

drop policy if exists household_reminder_reads_own on public.household_reminder_reads;
create policy household_reminder_reads_own
  on public.household_reminder_reads
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists usage_events_insert_own on public.usage_events;
create policy usage_events_insert_own
  on public.usage_events
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists usage_events_select_own on public.usage_events;
create policy usage_events_select_own
  on public.usage_events
  for select
  to authenticated
  using (user_id = auth.uid());
