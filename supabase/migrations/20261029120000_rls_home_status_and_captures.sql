-- applied manually via SQL Editor on 2026-10-29
--
-- Live-DB RLS audit (read-only pg_policies/pg_class review against the production
-- Supabase project) found two writable-without-proper-authorization holes:
--
-- 1. home_status_runs: the INSERT policy "Service role can insert home status"
--    had with_check = true for role `public`, and `anon` additionally held a
--    table-level INSERT grant. Any unauthenticated request could forge a
--    home-status row (status + memo text) for an arbitrary user_id, which then
--    surfaced on that real user's Home dashboard via home_status_latest.
--    Verified via grep that the only code path writing to this table is
--    app/api/home/status/run/route.ts, using the service-role client (which
--    bypasses RLS entirely) -- no user-session insert exists anywhere in the
--    app. So the policy is dropped outright, with no replacement.
--
-- 2. storage.objects "captures_upload_auth": with_check only tested
--    bucket_id = 'captures', not that the first path segment equals
--    auth.uid(). Any authenticated user could write a file into another
--    user's captures/{uid}/... folder (read was already correctly
--    restricted to the owner). Verified via grep that both upload call
--    sites to the captures bucket always prefix the path with the
--    uploading user's own id:
--      - lib/capture/useCaptureSubmit.ts:97  -> `${userId}/${inboxId}/...`
--      - components/AttachmentsBlock.tsx:107 -> `${userId}/decisions/${decisionId}/...`
--    so tightening the policy to require that prefix does not break either
--    upload path.

-- 1. home_status_runs: remove the open insert policy and the stray grants.
-- Nothing in the app inserts into this table except the service-role client,
-- which bypasses RLS and grants entirely -- so no replacement policy is needed.
drop policy if exists "Service role can insert home status" on public.home_status_runs;

revoke insert, update, delete, truncate on public.home_status_runs from anon;
revoke insert, update, delete, truncate on public.home_status_runs from authenticated;

-- 2. captures storage bucket: enforce the path-prefix convention the app
-- already follows, the same way household_receipts_storage_insert already
-- enforces it for the household-receipts bucket.
drop policy if exists "captures_upload_auth" on storage.objects;

create policy "captures_upload_auth"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'captures'
    and (auth.uid())::text = split_part(name, '/', 1)
  );

-- ---------------------------------------------------------------------------
-- ROLLBACK (not executed by this file -- run manually in the SQL Editor to revert)
-- ---------------------------------------------------------------------------
-- grant insert, update, delete, truncate on public.home_status_runs to anon;
-- grant insert, update, delete, truncate on public.home_status_runs to authenticated;
--
-- create policy "Service role can insert home status"
--   on public.home_status_runs
--   for insert
--   to public
--   with check (true);
--
-- drop policy if exists "captures_upload_auth" on storage.objects;
--
-- create policy "captures_upload_auth"
--   on storage.objects
--   for insert
--   to authenticated
--   with check (bucket_id = 'captures');
