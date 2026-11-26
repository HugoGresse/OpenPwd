-- Local development only: `supabase db reset` loads this file, production never does.
insert into private.instance_settings (key, value)
values
('allowed_email_domain', 'example.org'),
('allow_password_login', 'true'),
-- Dev accounts never re-authenticate through Google, so give them a working day.
('max_session_minutes', '720')
on conflict (key) do update set value = excluded.value;
