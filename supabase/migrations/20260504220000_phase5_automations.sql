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
