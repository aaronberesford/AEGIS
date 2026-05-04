create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists tool_calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  tool_name text not null,
  status text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

alter table approvals
  add column if not exists last_error text;

alter table tasks
  add column if not exists display_due_label text;

create index if not exists idx_conversations_workspace_id on conversations(workspace_id);
create index if not exists idx_messages_conversation_id on messages(conversation_id);
create index if not exists idx_tool_calls_workspace_id on tool_calls(workspace_id);
create unique index if not exists idx_integrations_workspace_provider_kind
  on integrations(workspace_id, provider, kind);
