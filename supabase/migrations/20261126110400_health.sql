create function public.health()
returns boolean
language sql
stable
set search_path = ''
as $$
    select true;
$$;

grant execute on function public.health() to anon, authenticated;
