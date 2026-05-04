-- AEGIS Supabase one-shot setup
-- Paste this whole file into the Supabase SQL Editor and run once.

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

create index if not exists idx_workspace_members_workspace_id on workspace_members(workspace_id);
create index if not exists idx_integrations_workspace_id on integrations(workspace_id);
create index if not exists idx_leads_workspace_id on leads(workspace_id);
create index if not exists idx_tasks_workspace_id on tasks(workspace_id);
create index if not exists idx_approvals_workspace_id on approvals(workspace_id);
create index if not exists idx_audit_logs_workspace_id on audit_logs(workspace_id);

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

create index if not exists idx_contacts_workspace_id on contacts(workspace_id);
create index if not exists idx_notes_workspace_id on notes(workspace_id);

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

create index if not exists idx_cron_jobs_next_run_at on cron_jobs(next_run_at);
create index if not exists idx_cron_jobs_automation_id on cron_jobs(automation_id);
create index if not exists idx_task_execution_logs_cron_job_id on task_execution_logs(cron_job_id);

insert into users (id, email, full_name)
values
  ('11111111-1111-1111-1111-111111111111', 'alex@aegis.local', 'Alex')
on conflict (id) do nothing;

insert into workspaces (
  id,
  name,
  slug,
  industry,
  tone_of_voice,
  services,
  target_customers,
  twilio_number,
  openai_settings,
  crm_settings,
  email_settings,
  website_settings,
  business_hours,
  approval_rules,
  voice_settings
)
values
  (
    '22222222-2222-2222-2222-222222222221',
    'Forklift Pro Solutions',
    'forklift-pro-solutions',
    'Material handling',
    'Confident, reliable, straight-talking',
    '["Forklift hire","Emergency repair","Fleet servicing"]'::jsonb,
    '["Warehouses","Factories","Distribution centres"]'::jsonb,
    '+44 113 555 0181',
    '{"model":"gpt-4.1-mini"}'::jsonb,
    '{"provider":"AEGIS CRM"}'::jsonb,
    '{"provider":"placeholder"}'::jsonb,
    '{"provider":"placeholder"}'::jsonb,
    '{"timezone":"Europe/London","allowed":["Mon","Tue","Wed","Thu","Fri"],"start":"08:00","end":"18:00"}'::jsonb,
    '{"sms":true,"email":true,"call":true,"bulk":true,"website":true}'::jsonb,
    '{"voice":"alloy","speed":1}'::jsonb
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Yorkshire Hamper Co.',
    'yorkshire-hamper-co',
    'Gift hampers',
    'Warm, premium, thoughtful',
    '["Corporate hampers","Seasonal gifting","Custom branded boxes"]'::jsonb,
    '["HR teams","Estate agents","Corporate buyers"]'::jsonb,
    '+44 113 555 0199',
    '{"model":"gpt-4.1-mini"}'::jsonb,
    '{"provider":"AEGIS CRM"}'::jsonb,
    '{"provider":"placeholder"}'::jsonb,
    '{"provider":"placeholder"}'::jsonb,
    '{"timezone":"Europe/London","allowed":["Mon","Tue","Wed","Thu","Fri","Sat"],"start":"09:00","end":"17:30"}'::jsonb,
    '{"sms":true,"email":true,"call":true,"bulk":true,"website":true}'::jsonb,
    '{"voice":"verse","speed":1}'::jsonb
  )
on conflict (id) do nothing;

insert into workspace_members (workspace_id, user_id, role)
values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'owner')
on conflict do nothing;

insert into contacts (id, workspace_id, full_name, phone, email, status, notes, last_contacted_at)
values
  ('33333333-3333-3333-3333-333333333331', '22222222-2222-2222-2222-222222222221', 'John Smith', '+44 7712 345678', 'john@northline.co.uk', 'quote sent', 'Prefers calls after 10am.', now()),
  ('33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222221', 'James Walker', '+44 7700 100200', 'james@metro-logistics.co.uk', 'hot lead', 'Waiting on service contract pricing.', now()),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Hannah Reed', '+44 7700 500900', 'hannah@northbrook-estates.co.uk', 'proposal requested', 'Corporate gifting opportunity.', now())
on conflict (id) do nothing;

insert into leads (workspace_id, contact_id, full_name, phone, email, source, status, summary, estimated_value, next_follow_up_at)
values
  ('22222222-2222-2222-2222-222222222221', '33333333-3333-3333-3333-333333333331', 'John Smith', '+44 7712 345678', 'john@northline.co.uk', 'Inbound call', 'Quote sent', 'Needs quote follow-up for 3-ton fleet package', 4200, now() + interval '1 day'),
  ('22222222-2222-2222-2222-222222222221', '33333333-3333-3333-3333-333333333332', 'James Walker', '+44 7700 100200', 'james@metro-logistics.co.uk', 'Website form', 'Hot lead', 'Requested service contract pricing', 9800, now() + interval '6 hours'),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'Hannah Reed', '+44 7700 500900', 'hannah@northbrook-estates.co.uk', 'Referral', 'Proposal requested', 'Corporate hamper proposal for estate agency onboarding', 2300, now() + interval '3 days')
on conflict do nothing;

insert into notes (workspace_id, lead_id, contact_id, content)
values
  ('22222222-2222-2222-2222-222222222221', (select id from leads where contact_id='33333333-3333-3333-3333-333333333331' limit 1), '33333333-3333-3333-3333-333333333331', 'John asked for a site survey option in the quote.'),
  ('22222222-2222-2222-2222-222222222221', (select id from leads where contact_id='33333333-3333-3333-3333-333333333332' limit 1), '33333333-3333-3333-3333-333333333332', 'Need to send maintenance pricing before end of day.')
on conflict do nothing;

insert into conversations (id, workspace_id, title)
values
  ('44444444-4444-4444-4444-444444444441', '22222222-2222-2222-2222-222222222221', 'Daily command feed'),
  ('44444444-4444-4444-4444-444444444442', '22222222-2222-2222-2222-222222222222', 'Yorkshire Hamper Co. brief')
on conflict (id) do nothing;

insert into messages (id, conversation_id, role, content)
values
  ('55555555-5555-5555-5555-555555555551', '44444444-4444-4444-4444-444444444441', 'assistant', 'Morning Alex. Forklift Pro Solutions has 3 approvals pending, 4 leads waiting on follow-up, and 1 missed call that already triggered the SMS recovery flow.'),
  ('55555555-5555-5555-5555-555555555552', '44444444-4444-4444-4444-444444444442', 'assistant', 'Yorkshire Hamper Co. has 2 corporate opportunities moving this week and no urgent issues in the queue.')
on conflict (id) do nothing;

insert into integrations (workspace_id, provider, kind, status, config)
values
  ('22222222-2222-2222-2222-222222222221', 'openai', 'ai', 'disconnected', '{"model":"gpt-4.1-mini"}'::jsonb),
  ('22222222-2222-2222-2222-222222222221', 'twilio', 'telephony', 'disconnected', '{"phoneNumber":"+44 113 555 0181"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'openai', 'ai', 'disconnected', '{"model":"gpt-4.1-mini"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'twilio', 'telephony', 'disconnected', '{"phoneNumber":"+44 113 555 0199"}'::jsonb)
on conflict do nothing;

insert into approvals (id, workspace_id, requested_by, action_type, recipient, payload, reason, risk_level, status)
values
  (
    '66666666-6666-6666-6666-666666666661',
    '22222222-2222-2222-2222-222222222221',
    '11111111-1111-1111-1111-111111111111',
    'make_call',
    'John Smith',
    '{"title":"Call John Smith","message":"Discuss the plumbing quote and next inspection slot.","metadata":{"phone":"+44 7712 345678"},"scheduledFor":"Today, 11:30 AM"}'::jsonb,
    'Lead asked for a call back on the last estimate.',
    'medium',
    'pending'
  )
on conflict (id) do nothing;

insert into automations (workspace_id, name, description, template_key, trigger_type, trigger_config, actions, enabled, last_run_at)
values
  (
    '22222222-2222-2222-2222-222222222221',
    'Missed call follow-up',
    'Draft an SMS, create a follow-up task, and notify the workspace owner.',
    'missed_call_follow_up',
    'Missed call received',
    '{}'::jsonb,
    '["Draft missed-call SMS for approval","Create follow-up task","Notify workspace owner"]'::jsonb,
    true,
    now() - interval '45 minutes'
  )
on conflict do nothing;

insert into cron_jobs (workspace_id, name, schedule, task_type, payload, enabled, status, next_run_at, retry_count, max_retries, lead_id, automation_id)
values
  (
    '22222222-2222-2222-2222-222222222221',
    'Daily CRM summary',
    'Every day, 09:00',
    'daily_crm_summary',
    '{"templateKey":"daily_crm_summary","recurrence":"daily","requiresApproval":false}'::jsonb,
    true,
    'pending',
    now() + interval '1 day',
    0,
    3,
    null,
    null
  ),
  (
    '22222222-2222-2222-2222-222222222221',
    'Follow up John Smith',
    'Tomorrow at 09:00',
    'lead_follow_up',
    jsonb_build_object(
      'recurrence', 'once',
      'leadId', (select id from leads where full_name = 'John Smith' limit 1),
      'requiresApproval', true
    ),
    true,
    'pending',
    now() + interval '1 day',
    0,
    3,
    (select id from leads where full_name = 'John Smith' limit 1),
    (select id from automations where template_key = 'missed_call_follow_up' limit 1)
  )
on conflict do nothing;

insert into task_execution_logs (cron_job_id, workspace_id, status, attempts, job_name, detail, created_at)
values
  (
    (select id from cron_jobs where name = 'Follow up John Smith' limit 1),
    '22222222-2222-2222-2222-222222222221',
    'completed',
    1,
    'Follow up John Smith',
    'Created a follow-up task and queued an approval-safe outreach draft.',
    now() - interval '1 day'
  )
on conflict do nothing;
