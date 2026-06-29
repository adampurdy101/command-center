-- Gmail integration · core schema
-- Encrypted token storage (Vault), slim message cache, sync state, purge fn.
-- All token RPCs are SECURITY DEFINER and executable by service_role only.

create extension if not exists pgcrypto with schema extensions;

-- ---------- TOKEN: stored encrypted in Vault, never a plaintext column ----------
create or replace function public.store_gmail_refresh_token(p_user uuid, p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare existing_id uuid;
begin
  select id into existing_id from vault.secrets where name = 'gmail_rt_' || p_user::text;
  if existing_id is null then
    perform vault.create_secret(p_token, 'gmail_rt_' || p_user::text, 'Gmail refresh token');
  else
    perform vault.update_secret(existing_id, p_token);
  end if;
end $$;

create or replace function public.read_gmail_refresh_token(p_user uuid)
returns text language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'gmail_rt_' || p_user::text;
$$;

create or replace function public.delete_gmail_refresh_token(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where name = 'gmail_rt_' || p_user::text;
end $$;

revoke execute on function public.store_gmail_refresh_token(uuid, text) from public, anon, authenticated;
revoke execute on function public.read_gmail_refresh_token(uuid)        from public, anon, authenticated;
revoke execute on function public.delete_gmail_refresh_token(uuid)      from public, anon, authenticated;
grant  execute on function public.store_gmail_refresh_token(uuid, text) to service_role;
grant  execute on function public.read_gmail_refresh_token(uuid)        to service_role;
grant  execute on function public.delete_gmail_refresh_token(uuid)      to service_role;

-- ---------- SLIM CACHE (no bodies, no attachments) ----------
create table if not exists public.email_cache (
  user_id      uuid not null references auth.users(id) on delete cascade,
  gmail_msg_id text not null,
  thread_id    text,
  from_name    text,
  from_email   text,
  subject      text,
  snippet      text,
  received_at  timestamptz,
  is_unread    boolean not null default true,
  labels       text[] default '{}',
  band         text,
  hal_summary  text,
  hal_draft    text,
  actioned_at  timestamptz,
  cached_at    timestamptz not null default now(),
  primary key (user_id, gmail_msg_id)
);
alter table public.email_cache enable row level security;
drop policy if exists email_cache_owner on public.email_cache;
create policy email_cache_owner on public.email_cache for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists email_cache_received_idx on public.email_cache (user_id, received_at desc);
create index if not exists email_cache_unread_idx   on public.email_cache (user_id, is_unread) where is_unread;

-- ---------- SYNC STATE ----------
create table if not exists public.sync_state (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  last_history_id text,
  last_sync_at    timestamptz,
  last_purge_at   timestamptz,
  updated_at      timestamptz not null default now()
);
alter table public.sync_state enable row level security;
drop policy if exists sync_state_owner on public.sync_state;
create policy sync_state_owner on public.sync_state for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- DAILY PURGE (pure SQL; keeps the cache tiny) ----------
create or replace function public.purge_email_cache()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.email_cache where actioned_at is not null and actioned_at < now() - interval '1 day';
  delete from public.email_cache where is_unread = false and received_at < now() - interval '7 days';
  delete from public.email_cache where received_at < now() - interval '30 days';
  update public.sync_state set last_purge_at = now(), updated_at = now();
end $$;
revoke execute on function public.purge_email_cache() from public, anon, authenticated;
