create table if not exists public.decision_events (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  channel_id           uuid not null references public.channels(id) on delete cascade,
  bot_role_id          uuid not null references public.bot_roles(id) on delete cascade,
  title                text not null,
  summary              text not null,
  action               text,
  action_dispatched_at timestamptz,
  created_at           timestamptz not null default now()
);

alter table public.decision_events enable row level security;

create policy "service_role_all" on public.decision_events
  for all to service_role
  using (true)
  with check (true);

create index decision_events_workspace_idx
  on public.decision_events(workspace_id, created_at desc);
