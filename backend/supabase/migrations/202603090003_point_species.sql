alter table public.points
  add column if not exists species_name text;

create index if not exists idx_points_species_name on public.points (species_name);

drop function if exists public.list_points(public.point_type, uuid);
create function public.list_points(
  p_type public.point_type default null,
  p_group_id uuid default null
)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_is_public boolean,
  type public.point_type,
  title text,
  species_name text,
  description text,
  status text,
  is_public boolean,
  longitude double precision,
  latitude double precision,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  viewer_can_manage boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.group_id,
    g.name as group_name,
    g.is_public as group_is_public,
    p.type,
    p.title,
    p.species_name,
    p.description,
    p.status,
    p.is_public,
    st_x(p.geom)::double precision as longitude,
    st_y(p.geom)::double precision as latitude,
    p.created_by,
    p.created_at,
    p.updated_at,
    public.can_manage_group_points(p.group_id) as viewer_can_manage
  from public.points p
  join public.groups g on g.id = p.group_id
  where (p_type is null or p.type = p_type)
    and (p_group_id is null or p.group_id = p_group_id)
    and public.can_read_group_point(p.group_id, p.is_public)
  order by p.created_at desc;
$$;

drop function if exists public.get_point(uuid);
create function public.get_point(p_point_id uuid)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_is_public boolean,
  type public.point_type,
  title text,
  species_name text,
  description text,
  status text,
  is_public boolean,
  longitude double precision,
  latitude double precision,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  updated_at timestamptz,
  viewer_can_manage boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.group_id,
    g.name as group_name,
    g.is_public as group_is_public,
    p.type,
    p.title,
    p.species_name,
    p.description,
    p.status,
    p.is_public,
    st_x(p.geom)::double precision as longitude,
    st_y(p.geom)::double precision as latitude,
    p.created_by,
    u.name as created_by_name,
    p.created_at,
    p.updated_at,
    public.can_manage_group_points(p.group_id) as viewer_can_manage
  from public.points p
  join public.groups g on g.id = p.group_id
  join public.users u on u.id = p.created_by
  where p.id = p_point_id
    and public.can_read_group_point(p.group_id, p.is_public)
  limit 1;
$$;

drop function if exists public.create_point(uuid, public.point_type, text, double precision, double precision, text, text, boolean);
create function public.create_point(
  p_group_id uuid,
  p_type public.point_type,
  p_title text,
  p_longitude double precision,
  p_latitude double precision,
  p_description text default null,
  p_status text default 'active',
  p_is_public boolean default false,
  p_species_name text default null
)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_is_public boolean,
  type public.point_type,
  title text,
  species_name text,
  description text,
  status text,
  is_public boolean,
  longitude double precision,
  latitude double precision,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  viewer_can_manage boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_point public.points;
begin
  insert into public.points (
    group_id,
    type,
    title,
    species_name,
    description,
    status,
    is_public,
    geom,
    created_by
  )
  values (
    p_group_id,
    p_type,
    p_title,
    case
      when p_type = 'tree' then nullif(trim(coalesce(p_species_name, '')), '')
      else null
    end,
    p_description,
    coalesce(nullif(p_status, ''), 'active'),
    coalesce(p_is_public, false),
    st_setsrid(st_makepoint(p_longitude, p_latitude), 4326),
    public.current_app_user_id()
  )
  returning * into v_point;

  return query
  select
    v_point.id,
    v_point.group_id,
    g.name as group_name,
    g.is_public as group_is_public,
    v_point.type,
    v_point.title,
    v_point.species_name,
    v_point.description,
    v_point.status,
    v_point.is_public,
    st_x(v_point.geom)::double precision as longitude,
    st_y(v_point.geom)::double precision as latitude,
    v_point.created_by,
    v_point.created_at,
    v_point.updated_at,
    public.can_manage_group_points(v_point.group_id) as viewer_can_manage
  from public.groups g
  where g.id = v_point.group_id;
end;
$$;

drop function if exists public.update_point(uuid, public.point_type, text, text, text, double precision, double precision, boolean);
create function public.update_point(
  p_point_id uuid,
  p_type public.point_type default null,
  p_title text default null,
  p_description text default null,
  p_status text default null,
  p_longitude double precision default null,
  p_latitude double precision default null,
  p_is_public boolean default null,
  p_species_name text default null
)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_is_public boolean,
  type public.point_type,
  title text,
  species_name text,
  description text,
  status text,
  is_public boolean,
  longitude double precision,
  latitude double precision,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  viewer_can_manage boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_point public.points;
begin
  update public.points
  set
    type = coalesce(p_type, type),
    title = coalesce(p_title, title),
    species_name = case
      when coalesce(p_type, type) = 'tree'
        then coalesce(nullif(trim(coalesce(p_species_name, '')), ''), species_name)
      else null
    end,
    description = coalesce(p_description, description),
    status = coalesce(p_status, status),
    is_public = coalesce(p_is_public, is_public),
    geom = case
      when p_longitude is not null and p_latitude is not null
        then st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)
      else geom
    end
  where id = p_point_id
  returning * into v_point;

  return query
  select
    v_point.id,
    v_point.group_id,
    g.name as group_name,
    g.is_public as group_is_public,
    v_point.type,
    v_point.title,
    v_point.species_name,
    v_point.description,
    v_point.status,
    v_point.is_public,
    st_x(v_point.geom)::double precision as longitude,
    st_y(v_point.geom)::double precision as latitude,
    v_point.created_by,
    v_point.created_at,
    v_point.updated_at,
    public.can_manage_group_points(v_point.group_id) as viewer_can_manage
  from public.groups g
  where g.id = v_point.group_id;
end;
$$;

grant execute on function public.list_points(public.point_type, uuid) to anon, authenticated, service_role;
grant execute on function public.get_point(uuid) to anon, authenticated, service_role;
grant execute on function public.create_point(uuid, public.point_type, text, double precision, double precision, text, text, boolean, text) to authenticated, service_role;
grant execute on function public.update_point(uuid, public.point_type, text, text, text, double precision, double precision, boolean, text) to authenticated, service_role;
