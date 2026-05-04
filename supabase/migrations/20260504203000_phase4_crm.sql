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
