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

insert into cron_jobs (workspace_id, name, schedule, task_type, payload, enabled)
values
  ('22222222-2222-2222-2222-222222222221', 'Morning email summary', '0 9 * * 1-5', 'summarize_email_placeholder', '{}'::jsonb, false)
on conflict do nothing;
