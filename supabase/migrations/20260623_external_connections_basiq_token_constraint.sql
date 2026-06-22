alter table public.external_connections
  drop constraint external_connections_token_required_check;

alter table public.external_connections
  add constraint external_connections_token_required_check
  check (
    coalesce(status, '') <> 'active'
    or (
      provider = 'basiq'
      and coalesce(item_id::text, '') ~ '"basiq_user_id"[[:space:]]*:[[:space:]]*"[^"]+"'
    )
    or (
      provider is distinct from 'basiq'
      and encrypted_access_token is not null
    )
  );
