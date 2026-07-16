alter table public.family_members
  add column if not exists archived_at timestamptz null;

alter table public.pets
  add column if not exists archived_at timestamptz null;

create index if not exists family_members_household_archived_at_idx
  on public.family_members (household_id, archived_at);

create index if not exists pets_household_archived_at_idx
  on public.pets (household_id, archived_at);
