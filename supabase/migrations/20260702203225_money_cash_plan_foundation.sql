-- Add the read-only database foundation for household Cash Plans.
-- Authenticated writes stay closed until concurrency-safe RPCs are added.

create table public.money_buckets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  purpose_type text not null,
  currency text not null default 'AUD',
  target_amount_cents bigint null,
  target_date date null,
  priority integer not null default 100,
  status text not null default 'active',
  notes text null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint money_buckets_name_not_blank_check
    check (length(btrim(name)) > 0),
  constraint money_buckets_purpose_type_check
    check (
      purpose_type in (
        'bills',
        'everyday',
        'true_expense',
        'safety',
        'goal',
        'giving',
        'flexible'
      )
    ),
  constraint money_buckets_currency_check
    check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  constraint money_buckets_target_amount_check
    check (target_amount_cents is null or target_amount_cents >= 0),
  constraint money_buckets_priority_check
    check (priority >= 0),
  constraint money_buckets_status_check
    check (status in ('active', 'paused', 'archived'))
);

create table public.money_bucket_allocations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  bucket_id uuid not null references public.money_buckets(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  allocation_type text not null,
  amount_cents bigint null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint money_bucket_allocations_type_check
    check (allocation_type in ('whole_account', 'partial_account')),
  constraint money_bucket_allocations_amount_check
    check (
      (allocation_type = 'whole_account' and amount_cents is null)
      or
      (allocation_type = 'partial_account' and amount_cents > 0)
    ),
  constraint money_bucket_allocations_bucket_account_key
    unique (bucket_id, account_id)
);

create index money_buckets_household_status_priority_idx
  on public.money_buckets (household_id, status, priority);

create index money_buckets_household_purpose_type_idx
  on public.money_buckets (household_id, purpose_type);

create index money_buckets_household_currency_idx
  on public.money_buckets (household_id, currency);

create index money_bucket_allocations_household_idx
  on public.money_bucket_allocations (household_id);

create index money_bucket_allocations_bucket_idx
  on public.money_bucket_allocations (bucket_id);

create index money_bucket_allocations_account_idx
  on public.money_bucket_allocations (account_id);

create index money_bucket_allocations_household_account_idx
  on public.money_bucket_allocations (household_id, account_id);

create or replace function public.set_money_cash_plan_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.validate_money_bucket_allocation_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  bucket_household_id uuid;
  bucket_currency text;
  account_household_id uuid;
  account_currency text;
  account_archived boolean;
begin
  select household_id, currency
    into bucket_household_id, bucket_currency
  from public.money_buckets
  where id = new.bucket_id;

  if not found then
    raise exception 'Bucket not found';
  end if;

  select household_id, currency, archived
    into account_household_id, account_currency, account_archived
  from public.accounts
  where id = new.account_id;

  if not found then
    raise exception 'Account not found';
  end if;

  if new.household_id is distinct from bucket_household_id
    or new.household_id is distinct from account_household_id then
    raise exception 'Bucket and account must belong to the same household';
  end if;

  if upper(bucket_currency) is distinct from upper(account_currency) then
    raise exception 'Bucket and account currencies must match';
  end if;

  if account_archived then
    raise exception 'Archived accounts cannot back buckets';
  end if;

  return new;
end;
$$;

create trigger money_buckets_set_updated_at
before update on public.money_buckets
for each row
execute function public.set_money_cash_plan_updated_at();

create trigger money_bucket_allocations_set_updated_at
before update on public.money_bucket_allocations
for each row
execute function public.set_money_cash_plan_updated_at();

create trigger money_bucket_allocations_validate_integrity
before insert or update on public.money_bucket_allocations
for each row
execute function public.validate_money_bucket_allocation_integrity();

alter table public.money_buckets enable row level security;
alter table public.money_bucket_allocations enable row level security;

create policy money_buckets_select_household_member
  on public.money_buckets
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy money_bucket_allocations_select_household_member
  on public.money_bucket_allocations
  for select
  to authenticated
  using (public.is_household_member(household_id));

revoke all on table public.money_buckets from public;
revoke all on table public.money_buckets from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.money_buckets from authenticated;

revoke all on table public.money_bucket_allocations from public;
revoke all on table public.money_bucket_allocations from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.money_bucket_allocations from authenticated;

grant select on table public.money_buckets to authenticated;
grant select on table public.money_bucket_allocations to authenticated;
grant all on table public.money_buckets to service_role;
grant all on table public.money_bucket_allocations to service_role;

revoke all on function public.set_money_cash_plan_updated_at() from public;
revoke all on function public.set_money_cash_plan_updated_at() from anon;
revoke all on function public.set_money_cash_plan_updated_at() from authenticated;

revoke all on function public.validate_money_bucket_allocation_integrity() from public;
revoke all on function public.validate_money_bucket_allocation_integrity() from anon;
revoke all on function public.validate_money_bucket_allocation_integrity() from authenticated;

comment on table public.money_buckets is
  'Household-defined purposes for current or future money. A bucket without allocations is tracked only.';

comment on table public.money_bucket_allocations is
  'Explicit account backing for a household money bucket. Application writes are deferred to future locking RPCs.';

comment on function public.validate_money_bucket_allocation_integrity() is
  'Validates household, currency, and archived-account integrity. Cash-account eligibility, whole-account exclusivity, and allocation totals require future concurrency-safe RPCs.';
