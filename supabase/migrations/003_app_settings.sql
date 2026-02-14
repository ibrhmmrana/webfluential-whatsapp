-- Key-value store for app config (e.g. WhatsApp AI dev/live mode and allowed numbers)
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

comment on table app_settings is 'App-wide settings. key e.g. whatsapp_ai, value e.g. { "devMode": true, "allowedNumbers": ["27693475825"] }.';
