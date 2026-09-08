insert into public.profiles (id, display_name, avatar_url, role)
select
  users.id,
  coalesce(nullif(users.raw_user_meta_data->>'display_name', ''), split_part(users.email, '@', 1), 'Jesang'),
  upper(left(coalesce(nullif(users.raw_user_meta_data->>'display_name', ''), split_part(users.email, '@', 1), 'Jesang'), 2)),
  'admin'::public.profile_role
from auth.users
where lower(users.email) = 'jesangpatel3@gmail.com'
on conflict (id) do update set
  role = 'admin'::public.profile_role,
  display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
  avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
