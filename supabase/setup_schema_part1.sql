-- AEGIS Supabase schema setup part 1
create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  industry text not null,
  tone_of_voice text not null,
  services jsonb not null default '[]'::jsonb,
  target_customers jsonb not null default '[]'::jsonb,
  twilio_number text,
  openai_settings jsonb not null default '{}'::jsonb,
  crm_settings jsonb not null default '{}'::jsonb,
  email_settings jsonb not null default '{}'::jsonb,
  website_settings jsonb not null default '{}'::jsonb,
  business_hours jsonb not null default '{}'::jsonb,
  approval_rules jsonb not null default '{}'::jsonb,
  voice_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,
  kind text not null,
  status text not null default 'disconnected',
  secret_ref text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  system_prompt text not null,
  model text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists tools (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  key text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  website text,
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  opt_out boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  source text,
  status text not null,
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  title text not null,
  stage text not null,
  value_gbp numeric(12,2) default 0,
  created_at timestamptz not null default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists call_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  direction text not null,
  status text not null,
  transcript text,
  recording_url text,
  summary text,
  outcome text,
  next_action text,
  created_at timestamptz not null default now()
);

create table if not exists sms_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  direction text not null,
  message_body text not null,
  provider_message_id text,
  created_at timestamptz not null default now()
);

create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  subject text not null,
  status text not null,
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_members_workspace_id on workspace_members(workspace_id);
create index if not exists idx_integrations_workspace_id on integrations(workspace_id);
create index if not exists idx_leads_workspace_id on leads(workspace_id);
create index if not exists idx_tasks_workspace_id on tasks(workspace_id);
