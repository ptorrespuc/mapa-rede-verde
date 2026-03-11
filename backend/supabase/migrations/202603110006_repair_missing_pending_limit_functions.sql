alter table public.groups
  add column if not exists max_pending_points_per_collaborator integer not null default 5;

alter table public.groups
  drop constraint if exists groups_max_pending_points_per_collaborator_check;

alter table public.groups
  add constraint groups_max_pending_points_per_collaborator_check
  check (max_pending_points_per_collaborator >= 1 and max_pending_points_per_collaborator <= 1000);

update public.groups
set max_pending_points_per_collaborator = 5
where max_pending_points_per_collaborator is null;

create or replace function public.current_user_pending_point_count(
  p_group_id uuid,
  p_user_id uuid,
  p_ignore_point_id uuid default null
)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)
  from public.points p
  where p.group_id = p_group_id
    and (p_ignore_point_id is null or p.id <> p_ignore_point_id)
    and (
      (p.created_by = p_user_id and p.approval_status = 'pending'::public.point_approval_status)
      or (p.pending_update_requested_by = p_user_id and p.pending_update_data is not null)
    );
$$;

create or replace function public.enforce_pending_point_limit(
  p_group_id uuid,
  p_user_id uuid,
  p_ignore_point_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_group public.groups;
  v_current_count integer;
begin
  select *
    into v_group
  from public.groups g
  where g.id = p_group_id;

  if v_group.id is null then
    raise exception 'Grupo invalido.';
  end if;

  v_current_count := public.current_user_pending_point_count(
    p_group_id,
    p_user_id,
    p_ignore_point_id
  );

  if v_current_count >= coalesce(v_group.max_pending_points_per_collaborator, 5) then
    raise exception
      'Este grupo permite no maximo % pontos pendentes por colaborador.',
      v_group.max_pending_points_per_collaborator;
  end if;
end;
$$;

drop function if exists public.list_groups();
create function public.list_groups()
returns table (
  id uuid,
  name text,
  code text,
  is_public boolean,
  accepts_point_collaboration boolean,
  max_pending_points_per_collaborator integer,
  logo_path text,
  my_role public.app_role,
  created_at timestamptz,
  viewer_can_manage boolean,
  viewer_can_submit_points boolean,
  viewer_can_approve_points boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.code,
    g.is_public,
    g.accepts_point_collaboration,
    g.max_pending_points_per_collaborator,
    g.logo_path,
    ug.role as my_role,
    g.created_at,
    public.can_manage_group_points(g.id) as viewer_can_manage,
    public.can_submit_group_points(g.id) as viewer_can_submit_points,
    public.can_approve_group_points(g.id) as viewer_can_approve_points
  from public.groups g
  left join public.user_groups ug
    on ug.group_id = g.id
   and ug.user_id = public.current_app_user_id()
  where public.can_read_group(g.id)
  order by g.name asc;
$$;

drop function if exists public.create_group(text, text, boolean, boolean);
create function public.create_group(
  p_name text,
  p_code text default null,
  p_is_public boolean default false,
  p_accepts_point_collaboration boolean default false,
  p_max_pending_points_per_collaborator integer default 5
)
returns table (
  id uuid,
  name text,
  code text,
  is_public boolean,
  accepts_point_collaboration boolean,
  max_pending_points_per_collaborator integer,
  logo_path text,
  my_role public.app_role,
  created_at timestamptz,
  viewer_can_manage boolean,
  viewer_can_submit_points boolean,
  viewer_can_approve_points boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group public.groups;
begin
  insert into public.groups (
    name,
    code,
    is_public,
    accepts_point_collaboration,
    max_pending_points_per_collaborator
  )
  values (
    trim(p_name),
    nullif(trim(coalesce(p_code, '')), ''),
    coalesce(p_is_public, false),
    coalesce(p_accepts_point_collaboration, false),
    greatest(1, coalesce(p_max_pending_points_per_collaborator, 5))
  )
  returning * into v_group;

  return query
  select
    v_group.id,
    v_group.name,
    v_group.code,
    v_group.is_public,
    v_group.accepts_point_collaboration,
    v_group.max_pending_points_per_collaborator,
    v_group.logo_path,
    null::public.app_role,
    v_group.created_at,
    public.can_manage_group_points(v_group.id),
    public.can_submit_group_points(v_group.id),
    public.can_approve_group_points(v_group.id);
end;
$$;

grant execute on function public.list_groups() to anon, authenticated, service_role;
grant execute on function public.create_group(text, text, boolean, boolean, integer) to authenticated, service_role;
