-- ============================================================
-- COMMAND CENTER schema  ·  Milestone 2
-- Applied to Supabase project fzsfizqkolkxkorgvtcl on 2026-06-20.
-- Every table is per-user. Row Level Security (RLS) is ON, and
-- each row is owned by the logged-in user (user_id = auth.uid()).
-- A public visitor with no login sees nothing; a logged-in user
-- sees ONLY their own rows. The morning GitHub Action uses the
-- service-role key (server-side) which bypasses RLS to write.
-- ============================================================

-- 01 · settings (one row per user; free-form prefs as JSON)
create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 02 · markets watchlist (editable list of tickers)
create table if not exists public.watchlist (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- tasks (feeds Daily Brief "open tasks")
create table if not exists public.tasks (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due date,
  created_at timestamptz not null default now()
);

-- 03 · projects (active project + progress + deadline)
create table if not exists public.projects (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  phase text,
  progress int not null default 0 check (progress between 0 and 100),
  deadline date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 04 · agents registry (one row per agent — status LED + last run)
--      Register a new hub-built agent by inserting a row here.
create table if not exists public.agents (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'helper',           -- helper / external / hal
  status text not null default 'IDLE',            -- ONLINE / IDLE / RUNNING / ALERT
  last_run timestamptz,
  created_at timestamptz not null default now()
);

-- 04 · agent action log (the scrolling Agent Ops feed)
create table if not exists public.agent_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agent text not null,
  action text not null,
  level text not null default 'info',             -- info / warn / error
  created_at timestamptz not null default now()
);

-- 05 · life admin items (personal threads + status tag)
create table if not exists public.life_items (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  status text,
  tag text,                                       -- up / warn / down (drives color)
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- 01 · daily brief (written by the 6 AM job; newest row is shown)
create table if not exists public.daily_brief (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  unread int,
  flagged int,
  next_event text,
  open_tasks int,
  digest text,
  created_at timestamptz not null default now()
);

-- helpful indexes
create index if not exists idx_watchlist_user  on public.watchlist(user_id);
create index if not exists idx_tasks_user      on public.tasks(user_id);
create index if not exists idx_projects_user   on public.projects(user_id);
create index if not exists idx_agents_user     on public.agents(user_id);
create index if not exists idx_agent_log_user  on public.agent_log(user_id, created_at desc);
create index if not exists idx_life_user       on public.life_items(user_id, sort);
create index if not exists idx_brief_user      on public.daily_brief(user_id, created_at desc);

-- ---- RLS: enable + owner-only policies on every table ----
do $$
declare t text;
begin
  foreach t in array array[
    'settings','watchlist','tasks','projects','agents','agent_log','life_items','daily_brief'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists own_select on public.%I;', t);
    execute format('drop policy if exists own_insert on public.%I;', t);
    execute format('drop policy if exists own_update on public.%I;', t);
    execute format('drop policy if exists own_delete on public.%I;', t);
    execute format('create policy own_select on public.%I for select using (user_id = auth.uid());', t);
    execute format('create policy own_insert on public.%I for insert with check (user_id = auth.uid());', t);
    execute format('create policy own_update on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
    execute format('create policy own_delete on public.%I for delete using (user_id = auth.uid());', t);
  end loop;
end $$;
