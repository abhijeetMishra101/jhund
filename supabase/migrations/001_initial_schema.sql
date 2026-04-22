-- ============================================================
-- Clan MVP — Initial Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists workspaces (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  template      text not null default 'startup' check (template in ('startup', 'enterprise', 'blank')),
  action_cap    int  not null default 50,
  actions_used  int  not null default 0,
  working_style text not null default 'balanced' check (working_style in ('hands-off', 'balanced', 'hands-on')),
  github_installation_id text,
  github_repo   text,
  created_at    timestamptz not null default now()
);

create table if not exists users (
  id            uuid primary key references auth.users(id) on delete cascade,
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  role          text not null default 'founder',
  created_at    timestamptz not null default now()
);

create table if not exists bot_roles (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  role_key      text not null,
  display_name  text not null,
  system_prompt text not null,
  avatar_seed   text not null,
  created_at    timestamptz not null default now()
);

create table if not exists channels (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,
  display_name  text not null,
  bot_role_id   uuid references bot_roles(id) on delete set null,
  position      int  not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  channel_id    uuid not null references channels(id) on delete cascade,
  author_type   text not null check (author_type in ('user', 'bot', 'system')),
  author_id     uuid not null,
  content       text not null,
  plan_id       uuid,  -- FK added after plans table
  created_at    timestamptz not null default now()
);

create table if not exists plans (
  id              uuid primary key default gen_random_uuid(),
  channel_id      uuid not null references channels(id) on delete cascade,
  bot_role_id     uuid not null references bot_roles(id) on delete cascade,
  description_md  text not null,
  github_actions  jsonb not null default '[]',
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'executed', 'failed')),
  approved_by     uuid references users(id) on delete set null,
  approved_at     timestamptz,
  executed_at     timestamptz,
  failure_reason  text,
  created_at      timestamptz not null default now()
);

-- Add FK from messages → plans now that plans table exists
alter table messages
  add constraint messages_plan_id_fkey
  foreign key (plan_id) references plans(id) on delete set null;

create table if not exists github_installations (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  installation_id text not null unique,
  repo_full_name  text not null,
  created_at      timestamptz not null default now()
);

create table if not exists github_triggers (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  event_type    text not null,
  label_filter  text,
  channel_id    uuid not null references channels(id) on delete cascade,
  bot_role_id   uuid not null references bot_roles(id) on delete cascade,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists messages_channel_id_created_at_idx on messages(channel_id, created_at desc);
create index if not exists messages_plan_id_idx on messages(plan_id) where plan_id is not null;
create index if not exists plans_channel_id_status_idx on plans(channel_id, status);
create index if not exists channels_workspace_id_position_idx on channels(workspace_id, position);
create index if not exists bot_roles_workspace_id_idx on bot_roles(workspace_id);
create index if not exists github_installations_workspace_id_idx on github_installations(workspace_id);
create index if not exists github_triggers_workspace_id_event_idx on github_triggers(workspace_id, event_type);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table workspaces         enable row level security;
alter table users              enable row level security;
alter table channels           enable row level security;
alter table messages           enable row level security;
alter table bot_roles          enable row level security;
alter table plans              enable row level security;
alter table github_installations enable row level security;
alter table github_triggers    enable row level security;

-- Helper: get the workspace_id for the current authenticated user
create or replace function get_my_workspace_id()
returns uuid language sql stable security definer as $$
  select workspace_id from users where id = auth.uid() limit 1;
$$;

-- workspaces: user can only see their own workspace
create policy "users see own workspace"
  on workspaces for select
  using (id = get_my_workspace_id());

create policy "users update own workspace"
  on workspaces for update
  using (id = get_my_workspace_id());

-- users: user can only see themselves
create policy "users see own row"
  on users for select
  using (id = auth.uid());

create policy "users insert own row"
  on users for insert
  with check (id = auth.uid());

-- channels: scoped to workspace
create policy "workspace members see channels"
  on channels for select
  using (workspace_id = get_my_workspace_id());

create policy "workspace members insert channels"
  on channels for insert
  with check (workspace_id = get_my_workspace_id());

create policy "workspace members update channels"
  on channels for update
  using (workspace_id = get_my_workspace_id());

-- messages: scoped to workspace via channel
create policy "workspace members see messages"
  on messages for select
  using (
    channel_id in (
      select id from channels where workspace_id = get_my_workspace_id()
    )
  );

create policy "workspace members insert messages"
  on messages for insert
  with check (
    channel_id in (
      select id from channels where workspace_id = get_my_workspace_id()
    )
  );

-- bot_roles: scoped to workspace
create policy "workspace members see bot_roles"
  on bot_roles for select
  using (workspace_id = get_my_workspace_id());

create policy "workspace members insert bot_roles"
  on bot_roles for insert
  with check (workspace_id = get_my_workspace_id());

create policy "workspace members update bot_roles"
  on bot_roles for update
  using (workspace_id = get_my_workspace_id());

-- plans: scoped to workspace via channel
create policy "workspace members see plans"
  on plans for select
  using (
    channel_id in (
      select id from channels where workspace_id = get_my_workspace_id()
    )
  );

create policy "workspace members insert plans"
  on plans for insert
  with check (
    channel_id in (
      select id from channels where workspace_id = get_my_workspace_id()
    )
  );

create policy "workspace members update plans"
  on plans for update
  using (
    channel_id in (
      select id from channels where workspace_id = get_my_workspace_id()
    )
  );

-- github_installations: scoped to workspace
create policy "workspace members see installations"
  on github_installations for select
  using (workspace_id = get_my_workspace_id());

-- github_triggers: scoped to workspace
create policy "workspace members see triggers"
  on github_triggers for select
  using (workspace_id = get_my_workspace_id());

create policy "workspace members manage triggers"
  on github_triggers for all
  using (workspace_id = get_my_workspace_id());

-- ============================================================
-- ACTION CAP — atomic increment function
-- Returns TRUE if increment succeeded, FALSE if cap was hit
-- ============================================================

create or replace function increment_action_count(p_workspace_id uuid)
returns boolean language plpgsql security definer as $$
declare
  updated_rows int;
begin
  update workspaces
  set actions_used = actions_used + 1
  where id = p_workspace_id
    and actions_used < action_cap;

  get diagnostics updated_rows = row_count;
  return updated_rows > 0;
end;
$$;
