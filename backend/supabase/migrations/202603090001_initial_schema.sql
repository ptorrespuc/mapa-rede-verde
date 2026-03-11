create extension if not exists postgis;
create extension if not exists pgcrypto;

create type public.app_role as enum (
  'super_admin',
  'group_admin',
  'group_approver',
  'group_collaborator'
);
create type public.point_type as enum ('tree', 'closed_tree_pit', 'planting_spot', 'inspection', 'other');

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_groups (
  user_id uuid not null references public.users (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  role public.app_role not null default 'group_collaborator',
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, group_id)
);

create table if not exists public.points (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  type public.point_type not null,
  title text not null,
  description text,
  status text not null default 'active',
  geom geometry(Point, 4326) not null,
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.point_events (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references public.points (id) on delete cascade,
  event_type text not null,
  description text,
  event_date timestamptz not null default timezone('utc', now()),
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.point_media (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references public.points (id) on delete cascade,
  file_url text not null,
  caption text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_groups_group_id on public.user_groups (group_id);
create index if not exists idx_user_groups_role on public.user_groups (role);
create index if not exists idx_points_group_id on public.points (group_id);
create index if not exists idx_points_type on public.points (type);
create index if not exists idx_points_status on public.points (status);
create index if not exists idx_points_geom on public.points using gist (geom);
create index if not exists idx_point_events_point_id on public.point_events (point_id);
create index if not exists idx_point_events_event_date on public.point_events (event_date desc);
create index if not exists idx_point_media_point_id on public.point_media (point_id);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_points_updated_at on public.points;
create trigger trg_points_updated_at
before update on public.points
for each row
execute function public.handle_updated_at();

create or replace function public.handle_auth_user_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (auth_user_id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (auth_user_id) do update
  set
    email = excluded.email,
    name = coalesce(nullif(public.users.name, ''), excluded.name);

  return new;
end;
$$;

drop trigger if exists trg_auth_user_sync on auth.users;
create trigger trg_auth_user_sync
after insert or update of email, raw_user_meta_data on auth.users
for each row
execute function public.handle_auth_user_sync();

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.current_user_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_groups ug
    join public.users u on u.id = ug.user_id
    where u.auth_user_id = auth.uid()
      and ug.role = 'super_admin'::public.app_role
  );
$$;

create or replace function public.has_group_access(target_group_id uuid)
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

create or replace function public.can_admin_group(target_group_id uuid)
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
        and ug.role = 'group_admin'::public.app_role
    );
$$;

create or replace function public.shares_group_with_user(target_user_id uuid)
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
      from public.user_groups mine
      join public.user_groups other on other.group_id = mine.group_id
      where mine.user_id = public.current_app_user_id()
        and other.user_id = target_user_id
    );
$$;

create or replace function public.can_access_point(target_point_id uuid)
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
      and public.has_group_access(p.group_id)
  );
$$;

alter table public.groups enable row level security;
alter table public.users enable row level security;
alter table public.user_groups enable row level security;
alter table public.points enable row level security;
alter table public.point_events enable row level security;
alter table public.point_media enable row level security;

drop policy if exists "groups_select" on public.groups;
create policy "groups_select"
on public.groups
for select
using (
  public.current_user_is_super_admin()
  or public.has_group_access(id)
);

drop policy if exists "groups_insert" on public.groups;
create policy "groups_insert"
on public.groups
for insert
with check (public.current_user_is_super_admin());

drop policy if exists "groups_update" on public.groups;
create policy "groups_update"
on public.groups
for update
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "groups_delete" on public.groups;
create policy "groups_delete"
on public.groups
for delete
using (public.current_user_is_super_admin());

drop policy if exists "users_select" on public.users;
create policy "users_select"
on public.users
for select
using (
  public.current_user_is_super_admin()
  or auth_user_id = auth.uid()
  or public.shares_group_with_user(id)
);

drop policy if exists "users_update" on public.users;
create policy "users_update"
on public.users
for update
using (
  public.current_user_is_super_admin()
  or auth_user_id = auth.uid()
)
with check (
  public.current_user_is_super_admin()
  or auth_user_id = auth.uid()
);

drop policy if exists "user_groups_select" on public.user_groups;
create policy "user_groups_select"
on public.user_groups
for select
using (
  public.current_user_is_super_admin()
  or user_id = public.current_app_user_id()
  or public.can_admin_group(group_id)
);

drop policy if exists "user_groups_insert" on public.user_groups;
create policy "user_groups_insert"
on public.user_groups
for insert
with check (
  public.current_user_is_super_admin()
  or (
    public.can_admin_group(group_id)
    and role <> 'super_admin'::public.app_role
  )
);

drop policy if exists "user_groups_update" on public.user_groups;
create policy "user_groups_update"
on public.user_groups
for update
using (
  public.current_user_is_super_admin()
  or public.can_admin_group(group_id)
)
with check (
  public.current_user_is_super_admin()
  or (
    public.can_admin_group(group_id)
    and role <> 'super_admin'::public.app_role
  )
);

drop policy if exists "user_groups_delete" on public.user_groups;
create policy "user_groups_delete"
on public.user_groups
for delete
using (
  public.current_user_is_super_admin()
  or public.can_admin_group(group_id)
);

drop policy if exists "points_select" on public.points;
create policy "points_select"
on public.points
for select
using (public.has_group_access(group_id));

drop policy if exists "points_insert" on public.points;
create policy "points_insert"
on public.points
for insert
with check (
  public.has_group_access(group_id)
  and created_by = public.current_app_user_id()
);

drop policy if exists "points_update" on public.points;
create policy "points_update"
on public.points
for update
using (public.has_group_access(group_id))
with check (
  public.has_group_access(group_id)
  and created_by is not null
);

drop policy if exists "points_delete" on public.points;
create policy "points_delete"
on public.points
for delete
using (public.has_group_access(group_id));

drop policy if exists "point_events_select" on public.point_events;
create policy "point_events_select"
on public.point_events
for select
using (public.can_access_point(point_id));

drop policy if exists "point_events_insert" on public.point_events;
create policy "point_events_insert"
on public.point_events
for insert
with check (
  public.can_access_point(point_id)
  and created_by = public.current_app_user_id()
);

drop policy if exists "point_media_select" on public.point_media;
create policy "point_media_select"
on public.point_media
for select
using (public.can_access_point(point_id));

drop policy if exists "point_media_insert" on public.point_media;
create policy "point_media_insert"
on public.point_media
for insert
with check (public.can_access_point(point_id));

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.groups to authenticated, service_role;
grant select, insert, update, delete on public.users to authenticated, service_role;
grant select, insert, update, delete on public.user_groups to authenticated, service_role;
grant select, insert, update, delete on public.points to authenticated, service_role;
grant select, insert, update, delete on public.point_events to authenticated, service_role;
grant select, insert, update, delete on public.point_media to authenticated, service_role;

create or replace function public.list_points(p_type public.point_type default null)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  type public.point_type,
  title text,
  description text,
  status text,
  longitude double precision,
  latitude double precision,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    p.group_id,
    g.name as group_name,
    p.type,
    p.title,
    p.description,
    p.status,
    st_x(p.geom)::double precision as longitude,
    st_y(p.geom)::double precision as latitude,
    p.created_by,
    p.created_at,
    p.updated_at
  from public.points p
  join public.groups g on g.id = p.group_id
  where p_type is null or p.type = p_type
  order by p.created_at desc;
$$;

create or replace function public.get_point(p_point_id uuid)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  type public.point_type,
  title text,
  description text,
  status text,
  longitude double precision,
  latitude double precision,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    p.group_id,
    g.name as group_name,
    p.type,
    p.title,
    p.description,
    p.status,
    st_x(p.geom)::double precision as longitude,
    st_y(p.geom)::double precision as latitude,
    p.created_by,
    u.name as created_by_name,
    p.created_at,
    p.updated_at
  from public.points p
  join public.groups g on g.id = p.group_id
  join public.users u on u.id = p.created_by
  where p.id = p_point_id
  limit 1;
$$;

create or replace function public.create_point(
  p_group_id uuid,
  p_type public.point_type,
  p_title text,
  p_longitude double precision,
  p_latitude double precision,
  p_description text default null,
  p_status text default 'active'
)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  type public.point_type,
  title text,
  description text,
  status text,
  longitude double precision,
  latitude double precision,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
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
    geom,
    created_by
  )
  values (
    p_group_id,
    p_type,
    p_title,
    p_description,
    coalesce(nullif(p_status, ''), 'active'),
    st_setsrid(st_makepoint(p_longitude, p_latitude), 4326),
    public.current_app_user_id()
  )
  returning * into v_point;

  return query
  select
    v_point.id,
    v_point.group_id,
    g.name as group_name,
    v_point.type,
    v_point.title,
    v_point.description,
    v_point.status,
    st_x(v_point.geom)::double precision as longitude,
    st_y(v_point.geom)::double precision as latitude,
    v_point.created_by,
    v_point.created_at,
    v_point.updated_at
  from public.groups g
  where g.id = v_point.group_id;
end;
$$;

create or replace function public.update_point(
  p_point_id uuid,
  p_type public.point_type default null,
  p_title text default null,
  p_description text default null,
  p_status text default null,
  p_longitude double precision default null,
  p_latitude double precision default null
)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  type public.point_type,
  title text,
  description text,
  status text,
  longitude double precision,
  latitude double precision,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
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
    v_point.type,
    v_point.title,
    v_point.description,
    v_point.status,
    st_x(v_point.geom)::double precision as longitude,
    st_y(v_point.geom)::double precision as latitude,
    v_point.created_by,
    v_point.created_at,
    v_point.updated_at
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
security invoker
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
  order by pe.event_date desc, pe.created_at desc;
$$;

create or replace function public.create_point_event(
  p_point_id uuid,
  p_event_type text,
  p_description text default null,
  p_event_date timestamptz default timezone('utc', now())
)
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
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event public.point_events;
begin
  insert into public.point_events (
    point_id,
    event_type,
    description,
    event_date,
    created_by
  )
  values (
    p_point_id,
    p_event_type,
    p_description,
    coalesce(p_event_date, timezone('utc', now())),
    public.current_app_user_id()
  )
  returning * into v_event;

  return query
  select
    v_event.id,
    v_event.point_id,
    v_event.event_type,
    v_event.description,
    v_event.event_date,
    v_event.created_by,
    u.name as created_by_name,
    v_event.created_at
  from public.users u
  where u.id = v_event.created_by;
end;
$$;

create or replace function public.list_groups()
returns table (
  id uuid,
  name text,
  my_role public.app_role,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    g.id,
    g.name,
    ug.role as my_role,
    g.created_at
  from public.groups g
  left join public.user_groups ug
    on ug.group_id = g.id
   and ug.user_id = public.current_app_user_id()
  order by g.name asc;
$$;

create or replace function public.create_group(p_name text)
returns table (
  id uuid,
  name text,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group public.groups;
begin
  insert into public.groups (name)
  values (p_name)
  returning * into v_group;

  return query
  select v_group.id, v_group.name, v_group.created_at;
end;
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
  insert into public.user_groups (user_id, group_id, role)
  values (p_user_id, p_group_id, p_role)
  on conflict (user_id, group_id) do update
  set role = excluded.role
  returning * into v_membership;

  return query
  select v_membership.user_id, v_membership.group_id, v_membership.role;
end;
$$;

grant execute on function public.list_points(public.point_type) to authenticated, service_role;
grant execute on function public.get_point(uuid) to authenticated, service_role;
grant execute on function public.create_point(uuid, public.point_type, text, double precision, double precision, text, text) to authenticated, service_role;
grant execute on function public.update_point(uuid, public.point_type, text, text, text, double precision, double precision) to authenticated, service_role;
grant execute on function public.list_point_events(uuid) to authenticated, service_role;
grant execute on function public.create_point_event(uuid, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.list_groups() to authenticated, service_role;
grant execute on function public.create_group(text) to authenticated, service_role;
grant execute on function public.add_user_to_group(uuid, uuid, public.app_role) to authenticated, service_role;
