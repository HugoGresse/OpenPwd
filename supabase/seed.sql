-- Local development only: `supabase db reset` loads this file, production never does.
insert into private.instance_settings (key, value)
values
('allowed_email_domain', 'example.org'),
('allow_password_login', 'true')
on conflict (key) do update set value = excluded.value;
