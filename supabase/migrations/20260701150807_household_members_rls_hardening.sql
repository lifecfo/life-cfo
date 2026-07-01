-- Require controlled server/RPC paths for all household membership changes.

revoke insert, update, delete on table public.household_members from public;
revoke insert, update, delete on table public.household_members from anon;
revoke insert, update, delete on table public.household_members from authenticated;

drop policy if exists household_members_insert_owner_editor
  on public.household_members;
drop policy if exists household_members_update_owner_editor
  on public.household_members;
drop policy if exists household_members_delete_owner_editor
  on public.household_members;

revoke execute on function public.set_household_member_role(uuid, uuid, text)
  from public;
revoke execute on function public.set_household_member_role(uuid, uuid, text)
  from anon;

revoke execute on function public.remove_household_member(uuid, uuid)
  from public;
revoke execute on function public.remove_household_member(uuid, uuid)
  from anon;

revoke execute on function public.leave_household(uuid)
  from public;
revoke execute on function public.leave_household(uuid)
  from anon;

grant execute on function public.set_household_member_role(uuid, uuid, text)
  to authenticated;
grant execute on function public.remove_household_member(uuid, uuid)
  to authenticated;
grant execute on function public.leave_household(uuid)
  to authenticated;
