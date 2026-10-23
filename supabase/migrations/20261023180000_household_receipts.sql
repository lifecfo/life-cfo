-- Private receipt and bill photos.
-- Idempotent. Do not apply from the app deploy. Review, then run once.
--
-- keystone_delete_my_data() deletes database rows only. It cannot remove
-- Storage objects. POST /api/delete-account removes household-receipts
-- objects with the service role before those rows are deleted.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'household-receipts',
  'household-receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.household_receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  item_id uuid null references public.household_items (id) on delete set null,
  created_by uuid not null,
  storage_path text not null,
  mime_type text not null,
  byte_size integer not null,
  created_at timestamptz not null default now(),
  constraint household_receipts_storage_path_key unique (storage_path),
  constraint household_receipts_mime_chk check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
  ),
  constraint household_receipts_size_chk check (byte_size > 0 and byte_size <= 5242880),
  constraint household_receipts_path_chk check (
    storage_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  )
);

create index if not exists household_receipts_household_idx
  on public.household_receipts (household_id, created_at desc);

create index if not exists household_receipts_item_idx
  on public.household_receipts (item_id);

alter table public.household_receipts enable row level security;

drop policy if exists household_receipts_select on public.household_receipts;
create policy household_receipts_select
  on public.household_receipts
  for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists household_receipts_insert on public.household_receipts;
create policy household_receipts_insert
  on public.household_receipts
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and created_by = auth.uid()
  );

drop policy if exists household_receipts_update on public.household_receipts;
create policy household_receipts_update
  on public.household_receipts
  for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (
    public.is_household_member(household_id)
    and storage_path like (household_id::text || '/%')
  );

drop policy if exists household_receipts_delete on public.household_receipts;
create policy household_receipts_delete
  on public.household_receipts
  for delete
  to authenticated
  using (public.is_household_member(household_id));

grant select, insert, update, delete on table public.household_receipts to authenticated;
grant all privileges on table public.household_receipts to service_role;

-- First path segment is the household id: <household_id>/<uuid>.jpg
drop policy if exists household_receipts_storage_select on storage.objects;
create policy household_receipts_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'household-receipts'
    and public.is_household_member(
      case
        when coalesce((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid
        else null
      end
    )
  );

drop policy if exists household_receipts_storage_insert on storage.objects;
create policy household_receipts_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'household-receipts'
    and public.is_household_member(
      case
        when coalesce((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid
        else null
      end
    )
  );

drop policy if exists household_receipts_storage_delete on storage.objects;
create policy household_receipts_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'household-receipts'
    and public.is_household_member(
      case
        when coalesce((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid
        else null
      end
    )
  );
