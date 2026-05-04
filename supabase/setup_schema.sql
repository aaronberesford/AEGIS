-- AEGIS Supabase schema setup
-- Paste this whole file into the Supabase SQL Editor and run first.

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

create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists cron_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  schedule text not null,
  task_type text not null,
  payload jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists task_execution_logs (
  id uuid primary key default gen_random_uuid(),
  cron_job_id uuid references cron_jobs(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  status text not null,
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  requested_by uuid references users(id) on delete set null,
  action_type text not null,
  recipient text,
  payload jsonb not null default '{}'::jsonb,
  reason text,
  risk_level text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  approval_status text not null default 'not_required',
  error text,
  created_at timestamptz not null default now()
);

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

alter table contacts
  add column if not exists status text not null default 'active',
  add column if not exists notes text not null default '',
  add column if not exists last_contacted_at timestamptz;

alter table leads
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists estimated_value numeric(12,2) not null default 0,
  add column if not exists next_follow_up_at timestamptz;

alter table tasks
  add column if not exists description text not null default '',
  add column if not exists contact_id uuid references contacts(id) on delete set null;

alter table notes
  add column if not exists contact_id uuid references contacts(id) on delete cascade;

alter table automations
  add column if not exists description text not null default '',
  add column if not exists template_key text,
  add column if not exists last_run_at timestamptz;

alter table cron_jobs
  add column if not exists status text not null default 'pending',
  add column if not exists next_run_at timestamptz,
  add column if not exists last_run_at timestamptz,
  add column if not exists last_error text,
  add column if not exists retry_count integer not null default 0,
  add column if not exists max_retries integer not null default 3,
  add column if not exists lead_id uuid references leads(id) on delete set null,
  add column if not exists automation_id uuid references automations(id) on delete set null;

alter table task_execution_logs
  add column if not exists job_name text not null default '',
  add column if not exists detail text not null default '';

create index if not exists idx_workspace_members_workspace_id on workspace_members(workspace_id);
create index if not exists idx_integrations_workspace_id on integrations(workspace_id);
create index if not exists idx_leads_workspace_id on leads(workspace_id);
create index if not exists idx_tasks_workspace_id on tasks(workspace_id);
create index if not exists idx_approvals_workspace_id on approvals(workspace_id);
create index if not exists idx_audit_logs_workspace_id on audit_logs(workspace_id);
create index if not exists idx_conversations_workspace_id on conversations(workspace_id);
create index if not exists idx_messages_conversation_id on messages(conversation_id);
create index if not exists idx_tool_calls_workspace_id on tool_calls(workspace_id);
create unique index if not exists idx_integrations_workspace_provider_kind
  on integrations(workspace_id, provider, kind);
create index if not exists idx_contacts_workspace_id on contacts(workspace_id);
create index if not exists idx_notes_workspace_id on notes(workspace_id);
create index if not exists idx_cron_jobs_next_run_at on cron_jobs(next_run_at);
create index if not exists idx_cron_jobs_automation_id on cron_jobs(automation_id);
create index if not exists idx_task_execution_logs_cron_job_id on task_execution_logs(cron_job_id);
