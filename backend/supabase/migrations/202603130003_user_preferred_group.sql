alter table public.users
  add column if not exists preferred_group_id uuid references public.groups (id) on delete set null;

create index if not exists idx_users_preferred_group_id
  on public.users (preferred_group_id);

with single_membership_users as (
  select ug.user_id, min(ug.group_id::text)::uuid as group_id
  from public.user_groups ug
  group by ug.user_id
  having count(*) = 1
)
update public.users u
set preferred_group_id = smu.group_id
from single_membership_users smu
where u.id = smu.user_id
  and u.preferred_group_id is null;
