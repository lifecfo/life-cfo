-- Daily AI request counts for the beta caps.
-- Idempotent. Do not apply from the app deploy. Review, then run once.
--
-- Authenticated users can read only their own row. Increments go through
-- consume_ai_request, which is executable by the service role only.

create table if not exists public.ai_usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day),
  constraint ai_usage_daily_count_chk check (count >= 0)
);

create index if not exists ai_usage_daily_day_idx
  on public.ai_usage_daily (day);

alter table public.ai_usage_daily enable row level security;

drop policy if exists ai_usage_daily_select on public.ai_usage_daily;
create policy ai_usage_daily_select
  on public.ai_usage_daily
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.ai_usage_daily from public, anon, authenticated;
grant select on table public.ai_usage_daily to authenticated;
grant select, insert, update, delete on table public.ai_usage_daily to service_role;

create or replace function public.consume_ai_request(
  p_user_id uuid,
  p_day date,
  p_user_limit integer,
  p_total_limit integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  user_count integer;
  total_count integer;
begin
  if p_user_id is null
     or p_day is null
     or p_user_limit is null
     or p_total_limit is null
     or p_user_limit < 1
     or p_total_limit < 1 then
    return 'denied';
  end if;

  perform pg_advisory_xact_lock(814201, hashtext(p_day::text));

  select coalesce(sum(count), 0)
    into total_count
  from public.ai_usage_daily
  where day = p_day;

  if total_count >= p_total_limit then
    return 'total';
  end if;

  select count
    into user_count
  from public.ai_usage_daily
  where user_id = p_user_id
    and day = p_day;

  if user_count is not null and user_count >= p_user_limit then
    return 'user';
  end if;

  insert into public.ai_usage_daily (user_id, day, count)
  values (p_user_id, p_day, 1)
  on conflict (user_id, day)
  do update set count = public.ai_usage_daily.count + 1;

  return 'ok';
end;
$$;

revoke all on function public.consume_ai_request(uuid, date, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_request(uuid, date, integer, integer) to service_role;
