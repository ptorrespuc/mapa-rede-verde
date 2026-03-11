create or replace function public.can_submit_group_points(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_group_points(target_group_id)
    or exists (
      select 1
      from public.user_groups ug
      join public.groups g on g.id = ug.group_id
      where ug.user_id = public.current_app_user_id()
        and ug.group_id = target_group_id
        and ug.role = 'group_collaborator'::public.app_role
        and g.accepts_point_collaboration
    )
    or (
      public.current_app_user_id() is not null
      and exists (
        select 1
        from public.groups g
        where g.id = target_group_id
          and g.is_public
          and g.accepts_point_collaboration
      )
    );
$$;
