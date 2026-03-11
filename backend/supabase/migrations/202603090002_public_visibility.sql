alter table public.groups
  add column if not exists is_public boolean not null default false;

alter table public.points
  add column if not exists is_public boolean not null default false;

create index if not exists idx_groups_is_public on public.groups (is_public);
create index if not exists idx_points_is_public on public.points (is_public);

create or replace function public.group_is_public(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = target_group_id
      and g.is_public
  );
$$;

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
      join public.users u on u.id = ug.user_id
      where u.auth_user_id = auth.uid()
        and ug.group_id = target_group_id
    );
$$;

create or replace function public.has_group_access(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_group_points(target_group_id);
$$;

create or replace function public.can_read_group(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_super_admin()
    or public.can_manage_group_points(target_group_id)
    or public.group_is_public(target_group_id);
$$;

create or replace function public.can_read_group_point(
  target_group_id uuid,
  target_point_is_public boolean
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_super_admin()
    or public.can_manage_group_points(target_group_id)
    or (coalesce(target_point_is_public, false) and public.group_is_public(target_group_id));
$$;

create or replace function public.can_read_point(target_point_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.points p
    where p.id = target_point_id
      and public.can_read_group_point(p.group_id, p.is_public)
  );
$$;

create or replace function public.can_access_point(target_point_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_read_point(target_point_id);
$$;

create or replace function public.can_manage_point(target_point_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.points p
    where p.id = target_point_id
      and public.can_manage_group_points(p.group_id)
  );
$$;

create or replace function public.handle_point_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_public boolean;
begin
  select g.is_public
    into v_group_public
  from public.groups g
  where g.id = new.group_id;

  if coalesce(v_group_public, false) = false then
    new.is_public = false;
  else
    new.is_public = coalesce(new.is_public, false);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_points_visibility on public.points;
create trigger trg_points_visibility
before insert or update of group_id, is_public on public.points
for each row
execute function public.handle_point_visibility();

update public.points p
set is_public = false
from public.groups g
where g.id = p.group_id
  and g.is_public = false
  and p.is_public = true;

drop policy if exists "groups_select" on public.groups;
create policy "groups_select"
on public.groups
for select
using (public.can_read_group(id));

drop policy if exists "users_select" on public.users;
create policy "users_select"
on public.users
for select
using (
  public.current_user_is_super_admin()
  or auth_user_id = auth.uid()
  or public.shares_group_with_user(id)
  or exists (
    select 1
    from public.points p
    join public.groups g on g.id = p.group_id
    where p.created_by = public.users.id
      and p.is_public
      and g.is_public
  )
  or exists (
    select 1
    from public.point_events pe
    join public.points p on p.id = pe.point_id
    join public.groups g on g.id = p.group_id
    where pe.created_by = public.users.id
      and p.is_public
      and g.is_public
  )
);

drop policy if exists "points_select" on public.points;
create policy "points_select"
on public.points
for select
using (public.can_read_group_point(group_id, is_public));

drop policy if exists "points_insert" on public.points;
create policy "points_insert"
on public.points
for insert
with check (
  public.can_manage_group_points(group_id)
  and created_by = public.current_app_user_id()
);

drop policy if exists "points_update" on public.points;
create policy "points_update"
on public.points
for update
using (public.can_manage_group_points(group_id))
with check (
  public.can_manage_group_points(group_id)
  and created_by is not null
);

drop policy if exists "points_delete" on public.points;
create policy "points_delete"
on public.points
for delete
using (public.can_manage_group_points(group_id));

drop policy if exists "point_events_select" on public.point_events;
create policy "point_events_select"
on public.point_events
for select
using (public.can_read_point(point_id));

drop policy if exists "point_events_insert" on public.point_events;
create policy "point_events_insert"
on public.point_events
for insert
with check (
  public.can_manage_point(point_id)
  and created_by = public.current_app_user_id()
);

drop policy if exists "point_media_select" on public.point_media;
create policy "point_media_select"
on public.point_media
for select
using (public.can_read_point(point_id));

drop policy if exists "point_media_insert" on public.point_media;
create policy "point_media_insert"
on public.point_media
for insert
with check (public.can_manage_point(point_id));

drop function if exists public.list_points(public.point_type);
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

drop function if exists public.create_point(uuid, public.point_type, text, double precision, double precision, text, text);
create function public.create_point(
  p_group_id uuid,
  p_type public.point_type,
  p_title text,
  p_longitude double precision,
  p_latitude double precision,
  p_description text default null,
  p_status text default 'active',
  p_is_public boolean default false
)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_is_public boolean,
  type public.point_type,
  title text,
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

drop function if exists public.update_point(uuid, public.point_type, text, text, text, double precision, double precision);
create function public.update_point(
  p_point_id uuid,
  p_type public.point_type default null,
  p_title text default null,
  p_description text default null,
  p_status text default null,
  p_longitude double precision default null,
  p_latitude double precision default null,
  p_is_public boolean default null
)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_is_public boolean,
  type public.point_type,
  title text,
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

create or replace function public.list_point_events(p_point_id uuid)
returns table (
  id uuid,
  point_id uuid,
  event_type text,
  description text,
  event_date timestamptz,
  created_by uuid,
  created_by_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pe.id,
    pe.point_id,
    pe.event_type,
    pe.description,
    pe.event_date,
    pe.created_by,
    u.name as created_by_name,
    pe.created_at
  from public.point_events pe
  join public.users u on u.id = pe.created_by
  where pe.point_id = p_point_id
    and public.can_read_point(pe.point_id)
  order by pe.event_date desc, pe.created_at desc;
$$;

drop function if exists public.list_groups();
create function public.list_groups()
returns table (
  id uuid,
  name text,
  is_public boolean,
  my_role public.app_role,
  created_at timestamptz,
  viewer_can_manage boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.is_public,
    ug.role as my_role,
    g.created_at,
    (public.current_user_is_super_admin() or ug.role is not null) as viewer_can_manage
  from public.groups g
  left join public.user_groups ug
    on ug.group_id = g.id
   and ug.user_id = public.current_app_user_id()
  where public.can_read_group(g.id)
  order by g.name asc;
$$;

drop function if exists public.create_group(text);
create function public.create_group(
  p_name text,
  p_is_public boolean default false
)
returns table (
  id uuid,
  name text,
  is_public boolean,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group public.groups;
begin
  insert into public.groups (name, is_public)
  values (p_name, coalesce(p_is_public, false))
  returning * into v_group;

  return query
  select v_group.id, v_group.name, v_group.is_public, v_group.created_at;
end;
$$;

grant select on public.users to anon;
grant select on public.groups to anon;
grant select on public.points to anon;
grant select on public.point_events to anon;
grant select on public.point_media to anon;

grant execute on function public.list_points(public.point_type, uuid) to anon, authenticated, service_role;
grant execute on function public.get_point(uuid) to anon, authenticated, service_role;
grant execute on function public.list_point_events(uuid) to anon, authenticated, service_role;
grant execute on function public.list_groups() to anon, authenticated, service_role;
grant execute on function public.create_point(uuid, public.point_type, text, double precision, double precision, text, text, boolean) to authenticated, service_role;
grant execute on function public.update_point(uuid, public.point_type, text, text, text, double precision, double precision, boolean) to authenticated, service_role;
grant execute on function public.create_group(text, boolean) to authenticated, service_role;
