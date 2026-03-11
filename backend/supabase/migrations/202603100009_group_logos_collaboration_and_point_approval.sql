do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'point_approval_status'
      and n.nspname = 'public'
  ) then
    create type public.point_approval_status as enum ('approved', 'pending', 'rejected');
  end if;
end;
$$;

alter table public.groups
  add column if not exists logo_path text,
  add column if not exists accepts_point_collaboration boolean not null default false;

alter table public.points
  add column if not exists approval_status public.point_approval_status not null default 'approved',
  add column if not exists approved_by uuid references public.users (id),
  add column if not exists approved_at timestamptz,
  add column if not exists pending_update_data jsonb,
  add column if not exists pending_update_requested_by uuid references public.users (id),
  add column if not exists pending_update_requested_at timestamptz;

update public.points
set
  approval_status = 'approved'::public.point_approval_status,
  approved_at = coalesce(approved_at, created_at)
where approval_status is null
   or approved_at is null;

create index if not exists idx_groups_accepts_point_collaboration
  on public.groups (accepts_point_collaboration);

create index if not exists idx_points_approval_status
  on public.points (approval_status);

create index if not exists idx_points_pending_update_requested_at
  on public.points (pending_update_requested_at desc);

create or replace function public.current_user_role_in_group(target_group_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select ug.role
  from public.user_groups ug
  where ug.user_id = public.current_app_user_id()
    and ug.group_id = target_group_id
  limit 1;
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
      where ug.user_id = public.current_app_user_id()
        and ug.group_id = target_group_id
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
      where ug.user_id = public.current_app_user_id()
        and ug.group_id = target_group_id
        and ug.role in (
          'group_admin'::public.app_role,
          'group_approver'::public.app_role
        )
    );
$$;

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
    );
$$;

create or replace function public.can_approve_group_points(target_group_id uuid)
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

create or replace function public.can_read_point_record(
  target_point_id uuid,
  target_group_id uuid,
  target_point_is_public boolean,
  target_approval_status public.point_approval_status,
  target_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when target_approval_status = 'approved'::public.point_approval_status then
        public.current_user_is_super_admin()
        or public.has_group_access(target_group_id)
        or (
          coalesce(target_point_is_public, false)
          and public.group_is_public(target_group_id)
        )
      else
        public.current_user_is_super_admin()
        or public.can_approve_group_points(target_group_id)
        or target_created_by = public.current_app_user_id()
    end;
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
      and public.can_read_point_record(
        p.id,
        p.group_id,
        p.is_public,
        p.approval_status,
        p.created_by
      )
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

create or replace function public.can_delete_point_record(
  target_group_id uuid,
  target_created_by uuid,
  target_approval_status public.point_approval_status
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_group_points(target_group_id)
    or (
      target_created_by = public.current_app_user_id()
      and target_approval_status <> 'approved'::public.point_approval_status
      and public.can_submit_group_points(target_group_id)
    );
$$;

create or replace function public.can_attach_media_to_point(target_point_id uuid)
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
      and (
        public.can_manage_group_points(p.group_id)
        or p.created_by = public.current_app_user_id()
      )
  );
$$;

create or replace function public.can_request_point_update_record(
  target_group_id uuid,
  target_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_group_points(target_group_id)
    or (
      target_created_by = public.current_app_user_id()
      and public.can_submit_group_points(target_group_id)
    );
$$;

drop policy if exists "points_select" on public.points;
create policy "points_select"
on public.points
for select
using (
  public.can_read_point_record(id, group_id, is_public, approval_status, created_by)
);

drop policy if exists "points_insert" on public.points;
create policy "points_insert"
on public.points
for insert
with check (
  public.can_submit_group_points(group_id)
  and created_by = public.current_app_user_id()
);

drop policy if exists "points_update" on public.points;
create policy "points_update"
on public.points
for update
using (public.can_manage_group_points(group_id))
with check (public.can_manage_group_points(group_id));

drop policy if exists "points_delete" on public.points;
create policy "points_delete"
on public.points
for delete
using (
  public.can_delete_point_record(group_id, created_by, approval_status)
);

drop policy if exists "point_events_insert" on public.point_events;
create policy "point_events_insert"
on public.point_events
for insert
with check (
  public.can_manage_point(point_id)
  and created_by = public.current_app_user_id()
);

drop policy if exists "point_media_insert" on public.point_media;
create policy "point_media_insert"
on public.point_media
for insert
with check (public.can_attach_media_to_point(point_id));

drop view if exists public.point_record_base;
create view public.point_record_base as
select
  p.id,
  p.group_id,
  g.name as group_name,
  g.code as group_code,
  g.is_public as group_is_public,
  g.accepts_point_collaboration as group_accepts_point_collaboration,
  g.logo_path as group_logo_path,
  pc.id as classification_id,
  pc.slug as classification_slug,
  pc.name as classification_name,
  pc.requires_species as classification_requires_species,
  pc.marker_color as classification_marker_color,
  p.title,
  p.species_id,
  coalesce(
    public.format_species_label(s.common_name, s.scientific_name),
    p.species_name
  ) as species_name,
  s.common_name as species_common_name,
  s.scientific_name as species_scientific_name,
  s.origin as species_origin,
  p.description,
  p.status,
  p.is_public,
  p.approval_status,
  p.pending_update_data,
  (p.pending_update_data is not null) as has_pending_update,
  p.pending_update_requested_by,
  p.pending_update_requested_at,
  st_x(p.geom)::double precision as longitude,
  st_y(p.geom)::double precision as latitude,
  p.created_by,
  p.created_at,
  p.updated_at,
  p.approved_by,
  p.approved_at
from public.points p
join public.groups g on g.id = p.group_id
join public.point_classifications pc on pc.id = p.point_classification_id
left join public.species s on s.id = p.species_id;

drop function if exists public.list_groups();
create function public.list_groups()
returns table (
  id uuid,
  name text,
  code text,
  is_public boolean,
  accepts_point_collaboration boolean,
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

drop function if exists public.create_group(text, boolean, boolean);
drop function if exists public.create_group(text, boolean);
create function public.create_group(
  p_name text,
  p_is_public boolean default false,
  p_accepts_point_collaboration boolean default false
)
returns table (
  id uuid,
  name text,
  code text,
  is_public boolean,
  accepts_point_collaboration boolean,
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
    is_public,
    accepts_point_collaboration
  )
  values (
    trim(p_name),
    coalesce(p_is_public, false),
    coalesce(p_accepts_point_collaboration, false)
  )
  returning * into v_group;

  return query
  select
    v_group.id,
    v_group.name,
    v_group.code,
    v_group.is_public,
    v_group.accepts_point_collaboration,
    v_group.logo_path,
    null::public.app_role,
    v_group.created_at,
    public.can_manage_group_points(v_group.id),
    public.can_submit_group_points(v_group.id),
    public.can_approve_group_points(v_group.id);
end;
$$;

drop function if exists public.list_points(uuid, uuid);
create function public.list_points(
  p_point_classification_id uuid default null,
  p_group_id uuid default null
)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_code text,
  group_is_public boolean,
  group_accepts_point_collaboration boolean,
  group_logo_path text,
  classification_id uuid,
  classification_slug text,
  classification_name text,
  classification_requires_species boolean,
  classification_marker_color text,
  title text,
  species_id uuid,
  species_name text,
  species_common_name text,
  species_scientific_name text,
  species_origin text,
  description text,
  status text,
  is_public boolean,
  approval_status public.point_approval_status,
  pending_update_data jsonb,
  has_pending_update boolean,
  pending_update_requested_by uuid,
  pending_update_requested_at timestamptz,
  longitude double precision,
  latitude double precision,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  viewer_can_manage boolean,
  viewer_can_submit boolean,
  viewer_can_approve boolean,
  viewer_can_request_update boolean,
  viewer_can_delete boolean,
  viewer_is_creator boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.group_id,
    p.group_name,
    p.group_code,
    p.group_is_public,
    p.group_accepts_point_collaboration,
    p.group_logo_path,
    p.classification_id,
    p.classification_slug,
    p.classification_name,
    p.classification_requires_species,
    p.classification_marker_color,
    p.title,
    p.species_id,
    p.species_name,
    p.species_common_name,
    p.species_scientific_name,
    p.species_origin,
    p.description,
    p.status,
    p.is_public,
    p.approval_status,
    p.pending_update_data,
    p.has_pending_update,
    p.pending_update_requested_by,
    p.pending_update_requested_at,
    p.longitude,
    p.latitude,
    p.created_by,
    p.created_at,
    p.updated_at,
    p.approved_by,
    p.approved_at,
    public.can_manage_group_points(p.group_id) as viewer_can_manage,
    public.can_submit_group_points(p.group_id) as viewer_can_submit,
    public.can_approve_group_points(p.group_id) as viewer_can_approve,
    public.can_request_point_update_record(p.group_id, p.created_by) as viewer_can_request_update,
    public.can_delete_point_record(p.group_id, p.created_by, p.approval_status) as viewer_can_delete,
    (p.created_by = public.current_app_user_id()) as viewer_is_creator
  from public.point_record_base p
  where p.approval_status = 'approved'::public.point_approval_status
    and (p_point_classification_id is null or p.classification_id = p_point_classification_id)
    and (p_group_id is null or p.group_id = p_group_id)
    and public.can_read_point_record(
      p.id,
      p.group_id,
      p.is_public,
      p.approval_status,
      p.created_by
    )
  order by p.created_at desc;
$$;

drop function if exists public.list_workspace_points(uuid, uuid, boolean, boolean);
create function public.list_workspace_points(
  p_point_classification_id uuid default null,
  p_group_id uuid default null,
  p_pending_only boolean default false,
  p_only_mine boolean default false
)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_code text,
  group_is_public boolean,
  group_accepts_point_collaboration boolean,
  group_logo_path text,
  classification_id uuid,
  classification_slug text,
  classification_name text,
  classification_requires_species boolean,
  classification_marker_color text,
  title text,
  species_id uuid,
  species_name text,
  species_common_name text,
  species_scientific_name text,
  species_origin text,
  description text,
  status text,
  is_public boolean,
  approval_status public.point_approval_status,
  pending_update_data jsonb,
  has_pending_update boolean,
  pending_update_requested_by uuid,
  pending_update_requested_at timestamptz,
  longitude double precision,
  latitude double precision,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  viewer_can_manage boolean,
  viewer_can_submit boolean,
  viewer_can_approve boolean,
  viewer_can_request_update boolean,
  viewer_can_delete boolean,
  viewer_is_creator boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.group_id,
    p.group_name,
    p.group_code,
    p.group_is_public,
    p.group_accepts_point_collaboration,
    p.group_logo_path,
    p.classification_id,
    p.classification_slug,
    p.classification_name,
    p.classification_requires_species,
    p.classification_marker_color,
    p.title,
    p.species_id,
    p.species_name,
    p.species_common_name,
    p.species_scientific_name,
    p.species_origin,
    p.description,
    p.status,
    p.is_public,
    p.approval_status,
    p.pending_update_data,
    p.has_pending_update,
    p.pending_update_requested_by,
    p.pending_update_requested_at,
    p.longitude,
    p.latitude,
    p.created_by,
    p.created_at,
    p.updated_at,
    p.approved_by,
    p.approved_at,
    public.can_manage_group_points(p.group_id) as viewer_can_manage,
    public.can_submit_group_points(p.group_id) as viewer_can_submit,
    public.can_approve_group_points(p.group_id) as viewer_can_approve,
    public.can_request_point_update_record(p.group_id, p.created_by) as viewer_can_request_update,
    public.can_delete_point_record(p.group_id, p.created_by, p.approval_status) as viewer_can_delete,
    (p.created_by = public.current_app_user_id()) as viewer_is_creator
  from public.point_record_base p
  where (p_point_classification_id is null or p.classification_id = p_point_classification_id)
    and (p_group_id is null or p.group_id = p_group_id)
    and (not p_only_mine or p.created_by = public.current_app_user_id())
    and (
      not p_pending_only
      or p.approval_status = 'pending'::public.point_approval_status
      or p.has_pending_update
    )
    and public.can_read_point_record(
      p.id,
      p.group_id,
      p.is_public,
      p.approval_status,
      p.created_by
    )
  order by
    case
      when p.approval_status = 'pending'::public.point_approval_status or p.has_pending_update
        then 0
      else 1
    end,
    coalesce(p.pending_update_requested_at, p.created_at) desc,
    p.updated_at desc;
$$;

drop function if exists public.get_point(uuid);
create function public.get_point(p_point_id uuid)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_code text,
  group_is_public boolean,
  group_accepts_point_collaboration boolean,
  group_logo_path text,
  classification_id uuid,
  classification_slug text,
  classification_name text,
  classification_requires_species boolean,
  classification_marker_color text,
  title text,
  species_id uuid,
  species_name text,
  species_common_name text,
  species_scientific_name text,
  species_origin text,
  description text,
  status text,
  is_public boolean,
  approval_status public.point_approval_status,
  pending_update_data jsonb,
  has_pending_update boolean,
  pending_update_requested_by uuid,
  pending_update_requested_at timestamptz,
  longitude double precision,
  latitude double precision,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  updated_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  viewer_can_manage boolean,
  viewer_can_submit boolean,
  viewer_can_approve boolean,
  viewer_can_request_update boolean,
  viewer_can_delete boolean,
  viewer_is_creator boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.group_id,
    p.group_name,
    p.group_code,
    p.group_is_public,
    p.group_accepts_point_collaboration,
    p.group_logo_path,
    p.classification_id,
    p.classification_slug,
    p.classification_name,
    p.classification_requires_species,
    p.classification_marker_color,
    p.title,
    p.species_id,
    p.species_name,
    p.species_common_name,
    p.species_scientific_name,
    p.species_origin,
    p.description,
    p.status,
    p.is_public,
    p.approval_status,
    p.pending_update_data,
    p.has_pending_update,
    p.pending_update_requested_by,
    p.pending_update_requested_at,
    p.longitude,
    p.latitude,
    p.created_by,
    u.name as created_by_name,
    p.created_at,
    p.updated_at,
    p.approved_by,
    p.approved_at,
    public.can_manage_group_points(p.group_id) as viewer_can_manage,
    public.can_submit_group_points(p.group_id) as viewer_can_submit,
    public.can_approve_group_points(p.group_id) as viewer_can_approve,
    public.can_request_point_update_record(p.group_id, p.created_by) as viewer_can_request_update,
    public.can_delete_point_record(p.group_id, p.created_by, p.approval_status) as viewer_can_delete,
    (p.created_by = public.current_app_user_id()) as viewer_is_creator
  from public.point_record_base p
  join public.users u on u.id = p.created_by
  where p.id = p_point_id
    and public.can_read_point_record(
      p.id,
      p.group_id,
      p.is_public,
      p.approval_status,
      p.created_by
    )
  limit 1;
$$;

drop function if exists public.create_point(uuid, uuid, text, double precision, double precision, text, text, boolean, uuid);
create function public.create_point(
  p_group_id uuid,
  p_point_classification_id uuid,
  p_title text,
  p_longitude double precision,
  p_latitude double precision,
  p_description text default null,
  p_status text default 'active',
  p_is_public boolean default null,
  p_species_id uuid default null
)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_code text,
  group_is_public boolean,
  group_accepts_point_collaboration boolean,
  group_logo_path text,
  classification_id uuid,
  classification_slug text,
  classification_name text,
  classification_requires_species boolean,
  classification_marker_color text,
  title text,
  species_id uuid,
  species_name text,
  species_common_name text,
  species_scientific_name text,
  species_origin text,
  description text,
  status text,
  is_public boolean,
  approval_status public.point_approval_status,
  pending_update_data jsonb,
  has_pending_update boolean,
  pending_update_requested_by uuid,
  pending_update_requested_at timestamptz,
  longitude double precision,
  latitude double precision,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  viewer_can_manage boolean,
  viewer_can_submit boolean,
  viewer_can_approve boolean,
  viewer_can_request_update boolean,
  viewer_can_delete boolean,
  viewer_is_creator boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.groups;
  v_point public.points;
  v_classification public.point_classifications;
  v_species public.species;
  v_actor_id uuid;
  v_effective_is_public boolean;
  v_approval_status public.point_approval_status;
  v_approved_by uuid;
  v_approved_at timestamptz;
begin
  v_actor_id := public.current_app_user_id();

  if v_actor_id is null then
    raise exception 'Nao autenticado.';
  end if;

  if not public.can_submit_group_points(p_group_id) then
    raise exception 'Voce nao tem permissao para criar pontos neste grupo.';
  end if;

  select *
    into v_group
  from public.groups g
  where g.id = p_group_id;

  if v_group.id is null then
    raise exception 'Grupo invalido.';
  end if;

  select *
    into v_classification
  from public.point_classifications pc
  where pc.id = p_point_classification_id;

  if v_classification.id is null then
    raise exception 'Classificacao de ponto invalida.';
  end if;

  if p_species_id is not null then
    select *
      into v_species
    from public.species s
    where s.id = p_species_id
      and s.is_active;

    if v_species.id is null then
      raise exception 'Especie invalida.';
    end if;
  end if;

  v_effective_is_public :=
    case
      when v_group.is_public then coalesce(p_is_public, true)
      else false
    end;

  if public.can_manage_group_points(p_group_id) then
    v_approval_status := 'approved'::public.point_approval_status;
    v_approved_by := v_actor_id;
    v_approved_at := timezone('utc', now());
  else
    v_approval_status := 'pending'::public.point_approval_status;
    v_approved_by := null;
    v_approved_at := null;
  end if;

  insert into public.points (
    group_id,
    type,
    point_classification_id,
    title,
    species_id,
    species_name,
    description,
    status,
    is_public,
    approval_status,
    approved_by,
    approved_at,
    geom,
    created_by
  )
  values (
    p_group_id,
    public.legacy_point_type_from_classification_slug(v_classification.slug),
    v_classification.id,
    trim(p_title),
    case
      when v_classification.requires_species then v_species.id
      else null
    end,
    case
      when v_classification.requires_species and v_species.id is not null
        then public.format_species_label(v_species.common_name, v_species.scientific_name)
      else null
    end,
    nullif(trim(coalesce(p_description, '')), ''),
    coalesce(nullif(trim(coalesce(p_status, '')), ''), 'active'),
    v_effective_is_public,
    v_approval_status,
    v_approved_by,
    v_approved_at,
    st_setsrid(st_makepoint(p_longitude, p_latitude), 4326),
    v_actor_id
  )
  returning * into v_point;

  return query
  select
    p.id,
    p.group_id,
    p.group_name,
    p.group_code,
    p.group_is_public,
    p.group_accepts_point_collaboration,
    p.group_logo_path,
    p.classification_id,
    p.classification_slug,
    p.classification_name,
    p.classification_requires_species,
    p.classification_marker_color,
    p.title,
    p.species_id,
    p.species_name,
    p.species_common_name,
    p.species_scientific_name,
    p.species_origin,
    p.description,
    p.status,
    p.is_public,
    p.approval_status,
    p.pending_update_data,
    p.has_pending_update,
    p.pending_update_requested_by,
    p.pending_update_requested_at,
    p.longitude,
    p.latitude,
    p.created_by,
    p.created_at,
    p.updated_at,
    p.approved_by,
    p.approved_at,
    public.can_manage_group_points(p.group_id) as viewer_can_manage,
    public.can_submit_group_points(p.group_id) as viewer_can_submit,
    public.can_approve_group_points(p.group_id) as viewer_can_approve,
    public.can_request_point_update_record(p.group_id, p.created_by) as viewer_can_request_update,
    public.can_delete_point_record(p.group_id, p.created_by, p.approval_status) as viewer_can_delete,
    (p.created_by = public.current_app_user_id()) as viewer_is_creator
  from public.point_record_base p
  where p.id = v_point.id;
end;
$$;

drop function if exists public.update_point(uuid, uuid, text, text, text, double precision, double precision, boolean, uuid, boolean);
create function public.update_point(
  p_point_id uuid,
  p_point_classification_id uuid default null,
  p_title text default null,
  p_description text default null,
  p_status text default null,
  p_longitude double precision default null,
  p_latitude double precision default null,
  p_is_public boolean default null,
  p_species_id uuid default null,
  p_species_id_provided boolean default false
)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_code text,
  group_is_public boolean,
  group_accepts_point_collaboration boolean,
  group_logo_path text,
  classification_id uuid,
  classification_slug text,
  classification_name text,
  classification_requires_species boolean,
  classification_marker_color text,
  title text,
  species_id uuid,
  species_name text,
  species_common_name text,
  species_scientific_name text,
  species_origin text,
  description text,
  status text,
  is_public boolean,
  approval_status public.point_approval_status,
  pending_update_data jsonb,
  has_pending_update boolean,
  pending_update_requested_by uuid,
  pending_update_requested_at timestamptz,
  longitude double precision,
  latitude double precision,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  viewer_can_manage boolean,
  viewer_can_submit boolean,
  viewer_can_approve boolean,
  viewer_can_request_update boolean,
  viewer_can_delete boolean,
  viewer_is_creator boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_point public.points;
  v_updated_point public.points;
  v_group public.groups;
  v_previous_classification public.point_classifications;
  v_next_classification public.point_classifications;
  v_target_species_id uuid;
  v_next_species public.species;
  v_actor_id uuid;
  v_can_manage boolean;
  v_can_submit boolean;
  v_is_creator boolean;
  v_effective_is_public boolean;
  v_pending_payload jsonb;
begin
  v_actor_id := public.current_app_user_id();

  if v_actor_id is null then
    raise exception 'Nao autenticado.';
  end if;

  select *
    into v_existing_point
  from public.points p
  where p.id = p_point_id;

  if v_existing_point.id is null then
    raise exception 'Ponto nao encontrado.';
  end if;

  select *
    into v_group
  from public.groups g
  where g.id = v_existing_point.group_id;

  if v_group.id is null then
    raise exception 'Grupo do ponto invalido.';
  end if;

  select *
    into v_previous_classification
  from public.point_classifications pc
  where pc.id = v_existing_point.point_classification_id;

  select *
    into v_next_classification
  from public.point_classifications pc
  where pc.id = coalesce(p_point_classification_id, v_existing_point.point_classification_id);

  if v_next_classification.id is null then
    raise exception 'Classificacao de ponto invalida.';
  end if;

  v_can_manage := public.can_manage_group_points(v_existing_point.group_id);
  v_can_submit := public.can_submit_group_points(v_existing_point.group_id);
  v_is_creator := v_existing_point.created_by = v_actor_id;

  if not v_can_manage and not (v_is_creator and v_can_submit) then
    raise exception 'Voce nao tem permissao para alterar este ponto.';
  end if;

  if v_next_classification.requires_species then
    if p_species_id_provided then
      v_target_species_id := p_species_id;
    else
      v_target_species_id := v_existing_point.species_id;
    end if;
  else
    v_target_species_id := null;
  end if;

  if v_target_species_id is not null then
    select *
      into v_next_species
    from public.species s
    where s.id = v_target_species_id
      and s.is_active;

    if v_next_species.id is null then
      raise exception 'Especie invalida.';
    end if;
  end if;

  v_effective_is_public :=
    case
      when v_group.is_public then coalesce(p_is_public, v_existing_point.is_public)
      else false
    end;

  if v_can_manage or v_existing_point.approval_status <> 'approved'::public.point_approval_status then
    update public.points as p
    set
      type = public.legacy_point_type_from_classification_slug(v_next_classification.slug),
      point_classification_id = v_next_classification.id,
      title = coalesce(nullif(trim(coalesce(p_title, '')), ''), p.title),
      species_id = case
        when v_next_classification.requires_species then v_target_species_id
        else null
      end,
      species_name = case
        when v_next_classification.requires_species and v_next_species.id is not null
          then public.format_species_label(v_next_species.common_name, v_next_species.scientific_name)
        else null
      end,
      description = coalesce(nullif(trim(coalesce(p_description, '')), ''), p.description),
      status = coalesce(nullif(trim(coalesce(p_status, '')), ''), p.status),
      is_public = v_effective_is_public,
      approval_status = case
        when v_can_manage then p.approval_status
        else 'pending'::public.point_approval_status
      end,
      approved_by = case
        when v_can_manage then p.approved_by
        else null
      end,
      approved_at = case
        when v_can_manage then p.approved_at
        else null
      end,
      pending_update_data = null,
      pending_update_requested_by = null,
      pending_update_requested_at = null,
      geom = case
        when p_longitude is not null and p_latitude is not null
          then st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)
        else p.geom
      end
    where p.id = p_point_id
    returning * into v_updated_point;
  else
    v_pending_payload := jsonb_build_object(
      'classification_id', v_next_classification.id,
      'title', coalesce(nullif(trim(coalesce(p_title, '')), ''), v_existing_point.title),
      'description', coalesce(nullif(trim(coalesce(p_description, '')), ''), v_existing_point.description),
      'status', coalesce(nullif(trim(coalesce(p_status, '')), ''), v_existing_point.status),
      'longitude', coalesce(p_longitude, st_x(v_existing_point.geom)::double precision),
      'latitude', coalesce(p_latitude, st_y(v_existing_point.geom)::double precision),
      'is_public', v_effective_is_public,
      'species_id', case
        when v_next_classification.requires_species then to_jsonb(v_target_species_id)
        else 'null'::jsonb
      end
    );

    update public.points as p
    set
      pending_update_data = v_pending_payload,
      pending_update_requested_by = v_actor_id,
      pending_update_requested_at = timezone('utc', now())
    where p.id = p_point_id
    returning * into v_updated_point;
  end if;

  if v_can_manage and v_previous_classification.id is distinct from v_next_classification.id then
    insert into public.point_events (
      point_id,
      point_event_type_id,
      event_type,
      description,
      event_date,
      created_by
    )
    values (
      v_updated_point.id,
      null,
      'reclassificacao',
      format(
        'Classificacao alterada de %s para %s.',
        v_previous_classification.name,
        v_next_classification.name
      ),
      timezone('utc', now()),
      v_actor_id
    );
  end if;

  return query
  select
    p.id,
    p.group_id,
    p.group_name,
    p.group_code,
    p.group_is_public,
    p.group_accepts_point_collaboration,
    p.group_logo_path,
    p.classification_id,
    p.classification_slug,
    p.classification_name,
    p.classification_requires_species,
    p.classification_marker_color,
    p.title,
    p.species_id,
    p.species_name,
    p.species_common_name,
    p.species_scientific_name,
    p.species_origin,
    p.description,
    p.status,
    p.is_public,
    p.approval_status,
    p.pending_update_data,
    p.has_pending_update,
    p.pending_update_requested_by,
    p.pending_update_requested_at,
    p.longitude,
    p.latitude,
    p.created_by,
    p.created_at,
    p.updated_at,
    p.approved_by,
    p.approved_at,
    public.can_manage_group_points(p.group_id) as viewer_can_manage,
    public.can_submit_group_points(p.group_id) as viewer_can_submit,
    public.can_approve_group_points(p.group_id) as viewer_can_approve,
    public.can_request_point_update_record(p.group_id, p.created_by) as viewer_can_request_update,
    public.can_delete_point_record(p.group_id, p.created_by, p.approval_status) as viewer_can_delete,
    (p.created_by = public.current_app_user_id()) as viewer_is_creator
  from public.point_record_base p
  where p.id = v_updated_point.id;
end;
$$;

drop function if exists public.review_point(uuid, text);
create function public.review_point(
  p_point_id uuid,
  p_action text
)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_code text,
  group_is_public boolean,
  group_accepts_point_collaboration boolean,
  group_logo_path text,
  classification_id uuid,
  classification_slug text,
  classification_name text,
  classification_requires_species boolean,
  classification_marker_color text,
  title text,
  species_id uuid,
  species_name text,
  species_common_name text,
  species_scientific_name text,
  species_origin text,
  description text,
  status text,
  is_public boolean,
  approval_status public.point_approval_status,
  pending_update_data jsonb,
  has_pending_update boolean,
  pending_update_requested_by uuid,
  pending_update_requested_at timestamptz,
  longitude double precision,
  latitude double precision,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  viewer_can_manage boolean,
  viewer_can_submit boolean,
  viewer_can_approve boolean,
  viewer_can_request_update boolean,
  viewer_can_delete boolean,
  viewer_is_creator boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_point public.points;
  v_updated_point public.points;
  v_group public.groups;
  v_previous_classification public.point_classifications;
  v_next_classification public.point_classifications;
  v_next_classification_id uuid;
  v_next_title text;
  v_next_description text;
  v_next_status text;
  v_next_longitude double precision;
  v_next_latitude double precision;
  v_next_is_public boolean;
  v_next_species_id uuid;
  v_next_species public.species;
  v_action text;
  v_actor_id uuid;
begin
  v_actor_id := public.current_app_user_id();
  v_action := lower(trim(coalesce(p_action, '')));

  if v_actor_id is null then
    raise exception 'Nao autenticado.';
  end if;

  if v_action not in ('approve', 'reject') then
    raise exception 'Acao invalida. Use approve ou reject.';
  end if;

  select *
    into v_point
  from public.points p
  where p.id = p_point_id;

  if v_point.id is null then
    raise exception 'Ponto nao encontrado.';
  end if;

  if not public.can_approve_group_points(v_point.group_id) then
    raise exception 'Voce nao tem permissao para revisar este ponto.';
  end if;

  select *
    into v_group
  from public.groups g
  where g.id = v_point.group_id;

  select *
    into v_previous_classification
  from public.point_classifications pc
  where pc.id = v_point.point_classification_id;

  if v_action = 'approve' and v_point.pending_update_data is not null then
    v_next_classification_id :=
      coalesce(
        nullif(v_point.pending_update_data ->> 'classification_id', '')::uuid,
        v_point.point_classification_id
      );

    select *
      into v_next_classification
    from public.point_classifications pc
    where pc.id = v_next_classification_id;

    if v_next_classification.id is null then
      raise exception 'A classificacao pendente e invalida.';
    end if;

    v_next_title :=
      coalesce(
        nullif(trim(coalesce(v_point.pending_update_data ->> 'title', '')), ''),
        v_point.title
      );
    v_next_description :=
      coalesce(
        nullif(trim(coalesce(v_point.pending_update_data ->> 'description', '')), ''),
        v_point.description
      );
    v_next_status :=
      coalesce(
        nullif(trim(coalesce(v_point.pending_update_data ->> 'status', '')), ''),
        v_point.status
      );
    v_next_longitude :=
      coalesce(
        nullif(v_point.pending_update_data ->> 'longitude', '')::double precision,
        st_x(v_point.geom)::double precision
      );
    v_next_latitude :=
      coalesce(
        nullif(v_point.pending_update_data ->> 'latitude', '')::double precision,
        st_y(v_point.geom)::double precision
      );
    v_next_is_public :=
      case
        when v_group.is_public then
          coalesce(
            nullif(v_point.pending_update_data ->> 'is_public', '')::boolean,
            v_point.is_public
          )
        else false
      end;
    v_next_species_id :=
      case
        when v_next_classification.requires_species then
          case
            when v_point.pending_update_data ? 'species_id'
              then nullif(v_point.pending_update_data ->> 'species_id', '')::uuid
            else v_point.species_id
          end
        else null
      end;

    if v_next_species_id is not null then
      select *
        into v_next_species
      from public.species s
      where s.id = v_next_species_id
        and s.is_active;

      if v_next_species.id is null then
        raise exception 'A especie pendente e invalida.';
      end if;
    end if;

    update public.points as p
    set
      type = public.legacy_point_type_from_classification_slug(v_next_classification.slug),
      point_classification_id = v_next_classification.id,
      title = v_next_title,
      species_id = case
        when v_next_classification.requires_species then v_next_species_id
        else null
      end,
      species_name = case
        when v_next_classification.requires_species and v_next_species.id is not null
          then public.format_species_label(v_next_species.common_name, v_next_species.scientific_name)
        else null
      end,
      description = v_next_description,
      status = v_next_status,
      is_public = v_next_is_public,
      pending_update_data = null,
      pending_update_requested_by = null,
      pending_update_requested_at = null,
      approved_by = v_actor_id,
      approved_at = timezone('utc', now()),
      geom = st_setsrid(st_makepoint(v_next_longitude, v_next_latitude), 4326)
    where p.id = p_point_id
    returning * into v_updated_point;

    if v_previous_classification.id is distinct from v_next_classification.id then
      insert into public.point_events (
        point_id,
        point_event_type_id,
        event_type,
        description,
        event_date,
        created_by
      )
      values (
        v_updated_point.id,
        null,
        'reclassificacao',
        format(
          'Classificacao alterada de %s para %s.',
          v_previous_classification.name,
          v_next_classification.name
        ),
        timezone('utc', now()),
        v_actor_id
      );
    end if;
  elsif v_action = 'approve' then
    update public.points as p
    set
      approval_status = 'approved'::public.point_approval_status,
      approved_by = v_actor_id,
      approved_at = timezone('utc', now())
    where p.id = p_point_id
    returning * into v_updated_point;
  elsif v_point.pending_update_data is not null then
    update public.points as p
    set
      pending_update_data = null,
      pending_update_requested_by = null,
      pending_update_requested_at = null
    where p.id = p_point_id
    returning * into v_updated_point;
  else
    update public.points as p
    set
      approval_status = 'rejected'::public.point_approval_status,
      approved_by = null,
      approved_at = null
    where p.id = p_point_id
    returning * into v_updated_point;
  end if;

  return query
  select
    p.id,
    p.group_id,
    p.group_name,
    p.group_code,
    p.group_is_public,
    p.group_accepts_point_collaboration,
    p.group_logo_path,
    p.classification_id,
    p.classification_slug,
    p.classification_name,
    p.classification_requires_species,
    p.classification_marker_color,
    p.title,
    p.species_id,
    p.species_name,
    p.species_common_name,
    p.species_scientific_name,
    p.species_origin,
    p.description,
    p.status,
    p.is_public,
    p.approval_status,
    p.pending_update_data,
    p.has_pending_update,
    p.pending_update_requested_by,
    p.pending_update_requested_at,
    p.longitude,
    p.latitude,
    p.created_by,
    p.created_at,
    p.updated_at,
    p.approved_by,
    p.approved_at,
    public.can_manage_group_points(p.group_id) as viewer_can_manage,
    public.can_submit_group_points(p.group_id) as viewer_can_submit,
    public.can_approve_group_points(p.group_id) as viewer_can_approve,
    public.can_request_point_update_record(p.group_id, p.created_by) as viewer_can_request_update,
    public.can_delete_point_record(p.group_id, p.created_by, p.approval_status) as viewer_can_delete,
    (p.created_by = public.current_app_user_id()) as viewer_is_creator
  from public.point_record_base p
  where p.id = v_updated_point.id;
end;
$$;

create or replace function public.list_point_events(p_point_id uuid)
returns table (
  id uuid,
  point_id uuid,
  point_event_type_id uuid,
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
    pe.point_event_type_id,
    pe.event_type,
    pe.description,
    pe.event_date,
    pe.created_by,
    u.name as created_by_name,
    pe.created_at
  from public.point_events pe
  join public.users u on u.id = pe.created_by
  where pe.point_id = p_point_id
    and public.can_access_point(pe.point_id)
  order by pe.event_date desc, pe.created_at desc;
$$;

create or replace function public.create_point_event(
  p_point_id uuid,
  p_point_event_type_id uuid default null,
  p_event_type text default null,
  p_description text default null,
  p_event_date timestamptz default timezone('utc', now())
)
returns table (
  id uuid,
  point_id uuid,
  point_event_type_id uuid,
  event_type text,
  description text,
  event_date timestamptz,
  created_by uuid,
  created_by_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.point_events;
  v_point public.points;
begin
  select *
    into v_point
  from public.points p
  where p.id = p_point_id;

  if v_point.id is null then
    raise exception 'Ponto nao encontrado.';
  end if;

  if not public.can_manage_point(p_point_id) then
    raise exception 'Voce nao tem permissao para registrar eventos neste ponto.';
  end if;

  insert into public.point_events (
    point_id,
    point_event_type_id,
    event_type,
    description,
    event_date,
    created_by
  )
  values (
    p_point_id,
    p_point_event_type_id,
    coalesce(nullif(trim(coalesce(p_event_type, '')), ''), 'evento'),
    nullif(trim(coalesce(p_description, '')), ''),
    coalesce(p_event_date, timezone('utc', now())),
    public.current_app_user_id()
  )
  returning * into v_event;

  return query
  select
    v_event.id,
    v_event.point_id,
    v_event.point_event_type_id,
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

grant execute on function public.list_groups() to anon, authenticated, service_role;
grant execute on function public.create_group(text, boolean, boolean) to authenticated, service_role;
grant execute on function public.list_points(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.list_workspace_points(uuid, uuid, boolean, boolean) to authenticated, service_role;
grant execute on function public.get_point(uuid) to anon, authenticated, service_role;
grant execute on function public.create_point(uuid, uuid, text, double precision, double precision, text, text, boolean, uuid) to authenticated, service_role;
grant execute on function public.update_point(uuid, uuid, text, text, text, double precision, double precision, boolean, uuid, boolean) to authenticated, service_role;
grant execute on function public.review_point(uuid, text) to authenticated, service_role;
grant execute on function public.list_point_events(uuid) to anon, authenticated, service_role;
grant execute on function public.create_point_event(uuid, uuid, text, text, timestamptz) to authenticated, service_role;
