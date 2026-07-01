-- Remove household members atomically while preserving a household owner.

create or replace function public.remove_household_member(
  p_household_id uuid,
  p_membership_id uuid
)
returns table (
  membership_id uuid,
  household_id uuid,
  removed boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  requester_id uuid := auth.uid();
  requester_role text;
  target_user_id uuid;
  target_role text;
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

  if requester_role is distinct from 'owner' then
    raise exception 'not_household_owner' using errcode = '42501';
  end if;

  select hm.user_id, hm.role::text
  into target_user_id, target_role
  from public.household_members hm
  where hm.id = p_membership_id
    and hm.household_id = p_household_id;

  if not found then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  if target_user_id = requester_id then
    raise exception 'use_leave_household' using errcode = 'P0001';
  end if;

  if target_role = 'owner' then
    select count(*)
    into owner_count
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.role::text = 'owner';

    if owner_count <= 1 then
      raise exception 'cannot_remove_last_owner' using errcode = 'P0001';
    end if;
  end if;

  delete from public.household_members hm
  where hm.id = p_membership_id
    and hm.household_id = p_household_id;

  return query select p_membership_id, p_household_id, true;
end;
$$;

revoke all on function public.remove_household_member(uuid, uuid) from public;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;
