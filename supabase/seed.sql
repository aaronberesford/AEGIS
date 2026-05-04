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

insert into contacts (id, workspace_id, full_name, phone, email)
values
  ('33333333-3333-3333-3333-333333333331', '22222222-2222-2222-2222-222222222221', 'John Smith', '+44 7712 345678', 'john@northline.co.uk'),
  ('33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222221', 'James Walker', '+44 7700 100200', 'james@metro-logistics.co.uk'),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Hannah Reed', '+44 7700 500900', 'hannah@northbrook-estates.co.uk')
on conflict (id) do nothing;

insert into leads (workspace_id, contact_id, source, status, summary)
values
  ('22222222-2222-2222-2222-222222222221', '33333333-3333-3333-3333-333333333331', 'Inbound call', 'Quote sent', 'Needs quote follow-up for 3-ton fleet package'),
  ('22222222-2222-2222-2222-222222222221', '33333333-3333-3333-3333-333333333332', 'Website form', 'Hot lead', 'Requested service contract pricing'),
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'Referral', 'Proposal requested', 'Corporate hamper proposal for estate agency onboarding')
on conflict do nothing;
