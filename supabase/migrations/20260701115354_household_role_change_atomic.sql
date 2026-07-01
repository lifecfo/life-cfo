-- Make household role changes atomic so every household keeps an owner.

create or replace function public.set_household_member_role(
  p_household_id uuid,
  p_membership_id uuid,
  p_role text
)
returns table (
  membership_id uuid,
  household_id uuid,
  role text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  requester_id uuid := auth.uid();
  requester_role text;
  target_role text;
  owner_count integer;
begin
  if requester_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_role not in ('owner', 'editor', 'viewer') then
    raise exception 'invalid_household_role' using errcode = '22023';
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

  select hm.role::text
  into target_role
  from public.household_members hm
  where hm.id = p_membership_id
    and hm.household_id = p_household_id;

  if target_role is null then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  if target_role = 'owner' and p_role <> 'owner' then
    select count(*)
    into owner_count
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.role::text = 'owner';

    if owner_count <= 1 then
      raise exception 'cannot_demote_last_owner' using errcode = 'P0001';
    end if;
  end if;

  return query
  update public.household_members hm
  set role = p_role
  where hm.id = p_membership_id
    and hm.household_id = p_household_id
  returning hm.id, hm.household_id, hm.role::text;
end;
$$;

revoke all on function public.set_household_member_role(uuid, uuid, text) from public;
grant execute on function public.set_household_member_role(uuid, uuid, text) to authenticated;
