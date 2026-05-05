create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type text not null,
  title text not null,
  description text not null default '',
  suggested_action text not null default '',
  priority text not null default 'medium',
  status text not null default 'pending',
  linked_entity_id text,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  message text not null,
  type text not null default 'info',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists workspace_summaries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null default 'daily',
  content text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists background_job_locks (
  lock_key text primary key,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_suggestions_workspace_id on suggestions(workspace_id);
create index if not exists idx_suggestions_status on suggestions(status);
create index if not exists idx_notifications_workspace_id on notifications(workspace_id);
create index if not exists idx_workspace_summaries_workspace_id on workspace_summaries(workspace_id);
