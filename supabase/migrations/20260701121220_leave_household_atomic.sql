-- Let an authenticated member leave without deleting shared household data.

create or replace function public.leave_household(p_household_id uuid)
returns table (
  household_id uuid,
  left_household boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  requester_id uuid := auth.uid();
  requester_role text;
  owner_count integer;
begin
  if requester_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  perform 1
  from public.households
  where id = p_household_id
  for update;

  if not found then
    raise exception 'household_not_found' using errcode = 'P0002';
  end if;

  select hm.role::text
  into requester_role
  from public.household_members hm
  where hm.household_id = p_household_id
    and hm.user_id = requester_id;

  if requester_role is null then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  if requester_role = 'owner' then
    select count(*)
    into owner_count
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.role::text = 'owner';

    if owner_count <= 1 then
      raise exception 'cannot_leave_last_owner' using errcode = 'P0001';
    end if;
  end if;

  delete from public.household_members hm
  where hm.household_id = p_household_id
    and hm.user_id = requester_id;

  return query select p_household_id, true;
end;
$$;

revoke all on function public.leave_household(uuid) from public;
grant execute on function public.leave_household(uuid) to authenticated;
