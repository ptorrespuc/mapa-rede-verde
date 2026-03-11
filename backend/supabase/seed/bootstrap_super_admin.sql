-- Bootstrap the first super admin after the user signs in once.
-- Replace the email below with the real login email.

with target_user as (
  select id
  from public.users
  where email = 'seu-email@exemplo.com'
  limit 1
)
insert into public.user_groups (user_id, group_id, role)
select
  target_user.id,
  bootstrap_group.id,
  'super_admin'::public.app_role
from target_user
cross join lateral (
  insert into public.groups (name)
  values ('Grupo Inicial')
  returning id
) as bootstrap_group
on conflict (user_id, group_id) do update
set role = excluded.role;
