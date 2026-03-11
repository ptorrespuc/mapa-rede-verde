update public.user_groups
set role = 'group_approver'::public.app_role
where role = 'group_user'::public.app_role;

alter table public.user_groups
  alter column role set default 'group_collaborator'::public.app_role;

alter table public.user_groups
  drop constraint if exists ck_user_groups_no_legacy_group_user;

alter table public.user_groups
  add constraint ck_user_groups_no_legacy_group_user
  check (role <> 'group_user'::public.app_role);

create or replace function public.can_manage_group_points(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_super_admin()
    or exists (
      select 1
      from public.user_groups ug
      where ug.user_id = public.current_app_user_id()
        and ug.group_id = target_group_id
        and ug.role in (
          'group_admin'::public.app_role,
          'group_approver'::public.app_role
        )
    );
$$;

create or replace function public.add_user_to_group(
  p_group_id uuid,
  p_user_id uuid,
  p_role public.app_role default 'group_collaborator'
)
returns table (
  user_id uuid,
  group_id uuid,
  role public.app_role
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_membership public.user_groups;
begin
  if p_role not in (
    'super_admin'::public.app_role,
    'group_admin'::public.app_role,
    'group_approver'::public.app_role,
    'group_collaborator'::public.app_role
  ) then
    raise exception 'Papel de grupo invalido.';
  end if;

  insert into public.user_groups (user_id, group_id, role)
  values (p_user_id, p_group_id, p_role)
  on conflict (user_id, group_id) do update
    set role = excluded.role
  returning * into v_membership;

  return query
  select v_membership.user_id, v_membership.group_id, v_membership.role;
end;
$$;
