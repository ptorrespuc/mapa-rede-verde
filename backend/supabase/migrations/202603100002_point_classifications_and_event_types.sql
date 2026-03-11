create table if not exists public.point_classifications (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  requires_species boolean not null default false,
  marker_color text not null default '#6a5a91',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.point_event_types (
  id uuid primary key default gen_random_uuid(),
  point_classification_id uuid not null references public.point_classifications (id) on delete cascade,
  slug text not null,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (point_classification_id, slug),
  unique (point_classification_id, name)
);

create index if not exists idx_point_classifications_slug on public.point_classifications (slug);
create index if not exists idx_point_event_types_classification_id on public.point_event_types (point_classification_id);

alter table public.points
  add column if not exists point_classification_id uuid references public.point_classifications (id);

alter table public.point_events
  add column if not exists point_event_type_id uuid references public.point_event_types (id) on delete set null;

create index if not exists idx_points_point_classification_id on public.points (point_classification_id);
create index if not exists idx_point_events_point_event_type_id on public.point_events (point_event_type_id);

insert into public.point_classifications (slug, name, requires_species, marker_color)
values
  ('tree', 'Arvore', true, '#2c8f5d'),
  ('closed_tree_pit', 'Gola cimentada', false, '#8f4a2c'),
  ('planting_spot', 'Local de plantio', false, '#bd9f2b'),
  ('inspection', 'Inspecao', false, '#2d6e9f'),
  ('other', 'Outro', false, '#6a5a91')
on conflict (slug) do update
set
  name = excluded.name,
  requires_species = excluded.requires_species,
  marker_color = excluded.marker_color,
  updated_at = timezone('utc', now());

update public.points p
set point_classification_id = pc.id
from public.point_classifications pc
where p.point_classification_id is null
  and pc.slug = p.type::text;

alter table public.points
  alter column point_classification_id set not null;

drop trigger if exists trg_point_classifications_updated_at on public.point_classifications;
create trigger trg_point_classifications_updated_at
before update on public.point_classifications
for each row
execute function public.handle_updated_at();

drop trigger if exists trg_point_event_types_updated_at on public.point_event_types;
create trigger trg_point_event_types_updated_at
before update on public.point_event_types
for each row
execute function public.handle_updated_at();

create or replace function public.normalize_slug(source_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(source_text, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.legacy_point_type_from_classification_slug(classification_slug text)
returns public.point_type
language sql
immutable
as $$
  select
    case classification_slug
      when 'tree' then 'tree'::public.point_type
      when 'closed_tree_pit' then 'closed_tree_pit'::public.point_type
      when 'planting_spot' then 'planting_spot'::public.point_type
      when 'inspection' then 'inspection'::public.point_type
      else 'other'::public.point_type
    end;
$$;

alter table public.point_classifications enable row level security;
alter table public.point_event_types enable row level security;

drop policy if exists "point_classifications_select" on public.point_classifications;
create policy "point_classifications_select"
on public.point_classifications
for select
using (true);

drop policy if exists "point_classifications_insert" on public.point_classifications;
create policy "point_classifications_insert"
on public.point_classifications
for insert
with check (public.current_user_is_super_admin());

drop policy if exists "point_classifications_update" on public.point_classifications;
create policy "point_classifications_update"
on public.point_classifications
for update
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "point_classifications_delete" on public.point_classifications;
create policy "point_classifications_delete"
on public.point_classifications
for delete
using (public.current_user_is_super_admin());

drop policy if exists "point_event_types_select" on public.point_event_types;
create policy "point_event_types_select"
on public.point_event_types
for select
using (true);

drop policy if exists "point_event_types_insert" on public.point_event_types;
create policy "point_event_types_insert"
on public.point_event_types
for insert
with check (public.current_user_is_super_admin());

drop policy if exists "point_event_types_update" on public.point_event_types;
create policy "point_event_types_update"
on public.point_event_types
for update
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "point_event_types_delete" on public.point_event_types;
create policy "point_event_types_delete"
on public.point_event_types
for delete
using (public.current_user_is_super_admin());

grant select on public.point_classifications to anon;
grant select on public.point_event_types to anon;
grant select, insert, update, delete on public.point_classifications to authenticated, service_role;
grant select, insert, update, delete on public.point_event_types to authenticated, service_role;

drop function if exists public.list_point_classifications();
create function public.list_point_classifications()
returns table (
  id uuid,
  slug text,
  name text,
  requires_species boolean,
  marker_color text,
  created_at timestamptz,
  updated_at timestamptz,
  event_type_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pc.id,
    pc.slug,
    pc.name,
    pc.requires_species,
    pc.marker_color,
    pc.created_at,
    pc.updated_at,
    count(pet.id)::bigint as event_type_count
  from public.point_classifications pc
  left join public.point_event_types pet on pet.point_classification_id = pc.id
  group by
    pc.id,
    pc.slug,
    pc.name,
    pc.requires_species,
    pc.marker_color,
    pc.created_at,
    pc.updated_at
  order by pc.name asc;
$$;

drop function if exists public.list_point_event_types(uuid);
create function public.list_point_event_types(p_point_classification_id uuid default null)
returns table (
  id uuid,
  point_classification_id uuid,
  point_classification_name text,
  slug text,
  name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pet.id,
    pet.point_classification_id,
    pc.name as point_classification_name,
    pet.slug,
    pet.name,
    pet.created_at,
    pet.updated_at
  from public.point_event_types pet
  join public.point_classifications pc on pc.id = pet.point_classification_id
  where p_point_classification_id is null
    or pet.point_classification_id = p_point_classification_id
  order by pc.name asc, pet.name asc;
$$;

drop function if exists public.create_point_classification(text, text, boolean, text);
create function public.create_point_classification(
  p_name text,
  p_slug text default null,
  p_requires_species boolean default false,
  p_marker_color text default '#6a5a91'
)
returns table (
  id uuid,
  slug text,
  name text,
  requires_species boolean,
  marker_color text,
  created_at timestamptz,
  updated_at timestamptz,
  event_type_count bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_classification public.point_classifications;
begin
  insert into public.point_classifications (
    slug,
    name,
    requires_species,
    marker_color
  )
  values (
    coalesce(nullif(trim(p_slug), ''), public.normalize_slug(p_name)),
    trim(p_name),
    coalesce(p_requires_species, false),
    coalesce(nullif(trim(p_marker_color), ''), '#6a5a91')
  )
  returning * into v_classification;

  return query
  select
    v_classification.id,
    v_classification.slug,
    v_classification.name,
    v_classification.requires_species,
    v_classification.marker_color,
    v_classification.created_at,
    v_classification.updated_at,
    0::bigint as event_type_count;
end;
$$;

drop function if exists public.create_point_event_type(uuid, text, text);
create function public.create_point_event_type(
  p_point_classification_id uuid,
  p_name text,
  p_slug text default null
)
returns table (
  id uuid,
  point_classification_id uuid,
  point_classification_name text,
  slug text,
  name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_type public.point_event_types;
  v_classification_name text;
begin
  select pc.name
    into v_classification_name
  from public.point_classifications pc
  where pc.id = p_point_classification_id;

  if v_classification_name is null then
    raise exception 'Classificacao de ponto invalida.';
  end if;

  insert into public.point_event_types (
    point_classification_id,
    slug,
    name
  )
  values (
    p_point_classification_id,
    coalesce(nullif(trim(p_slug), ''), public.normalize_slug(p_name)),
    trim(p_name)
  )
  returning * into v_event_type;

  return query
  select
    v_event_type.id,
    v_event_type.point_classification_id,
    v_classification_name,
    v_event_type.slug,
    v_event_type.name,
    v_event_type.created_at,
    v_event_type.updated_at;
end;
$$;

drop function if exists public.list_points(uuid, uuid);
drop function if exists public.list_points(public.point_type, uuid);
create function public.list_points(
  p_point_classification_id uuid default null,
  p_group_id uuid default null
)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_is_public boolean,
  classification_id uuid,
  classification_slug text,
  classification_name text,
  classification_requires_species boolean,
  classification_marker_color text,
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
    pc.id as classification_id,
    pc.slug as classification_slug,
    pc.name as classification_name,
    pc.requires_species as classification_requires_species,
    pc.marker_color as classification_marker_color,
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
  join public.point_classifications pc on pc.id = p.point_classification_id
  where (p_point_classification_id is null or p.point_classification_id = p_point_classification_id)
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
  classification_id uuid,
  classification_slug text,
  classification_name text,
  classification_requires_species boolean,
  classification_marker_color text,
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
    pc.id as classification_id,
    pc.slug as classification_slug,
    pc.name as classification_name,
    pc.requires_species as classification_requires_species,
    pc.marker_color as classification_marker_color,
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
  join public.point_classifications pc on pc.id = p.point_classification_id
  where p.id = p_point_id
    and public.can_read_group_point(p.group_id, p.is_public)
  limit 1;
$$;

drop function if exists public.create_point(uuid, uuid, text, double precision, double precision, text, text, boolean, text);
drop function if exists public.create_point(uuid, public.point_type, text, double precision, double precision, text, text, boolean, text);
create function public.create_point(
  p_group_id uuid,
  p_point_classification_id uuid,
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
  classification_id uuid,
  classification_slug text,
  classification_name text,
  classification_requires_species boolean,
  classification_marker_color text,
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
  v_classification public.point_classifications;
  v_species_name text;
begin
  select *
    into v_classification
  from public.point_classifications
  where id = p_point_classification_id;

  if v_classification.id is null then
    raise exception 'Classificacao de ponto invalida.';
  end if;

  v_species_name := nullif(trim(coalesce(p_species_name, '')), '');

  if v_classification.requires_species and v_species_name is null then
    raise exception 'Selecione uma especie para esta classificacao de ponto.';
  end if;

  insert into public.points (
    group_id,
    type,
    point_classification_id,
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
    public.legacy_point_type_from_classification_slug(v_classification.slug),
    v_classification.id,
    p_title,
    case when v_classification.requires_species then v_species_name else null end,
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
    v_classification.id,
    v_classification.slug,
    v_classification.name,
    v_classification.requires_species,
    v_classification.marker_color,
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

drop function if exists public.update_point(uuid, uuid, text, text, text, double precision, double precision, boolean, text);
drop function if exists public.update_point(uuid, public.point_type, text, text, text, double precision, double precision, boolean, text);
create function public.update_point(
  p_point_id uuid,
  p_point_classification_id uuid default null,
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
  classification_id uuid,
  classification_slug text,
  classification_name text,
  classification_requires_species boolean,
  classification_marker_color text,
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
  v_existing_point public.points;
  v_updated_point public.points;
  v_previous_classification public.point_classifications;
  v_next_classification public.point_classifications;
  v_species_name text;
begin
  select *
    into v_existing_point
  from public.points
  where id = p_point_id;

  if v_existing_point.id is null then
    raise exception 'Ponto nao encontrado.';
  end if;

  select *
    into v_previous_classification
  from public.point_classifications
  where id = v_existing_point.point_classification_id;

  select *
    into v_next_classification
  from public.point_classifications
  where id = coalesce(p_point_classification_id, v_existing_point.point_classification_id);

  if v_next_classification.id is null then
    raise exception 'Classificacao de ponto invalida.';
  end if;

  v_species_name := nullif(trim(coalesce(p_species_name, '')), '');

  if v_next_classification.requires_species
     and coalesce(v_species_name, v_existing_point.species_name) is null then
    raise exception 'Selecione uma especie para esta classificacao de ponto.';
  end if;

  update public.points
  set
    type = public.legacy_point_type_from_classification_slug(v_next_classification.slug),
    point_classification_id = v_next_classification.id,
    title = coalesce(p_title, title),
    species_name = case
      when v_next_classification.requires_species
        then coalesce(v_species_name, species_name)
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
      public.current_app_user_id()
    );
  end if;

  return query
  select
    v_updated_point.id,
    v_updated_point.group_id,
    g.name as group_name,
    g.is_public as group_is_public,
    v_next_classification.id,
    v_next_classification.slug,
    v_next_classification.name,
    v_next_classification.requires_species,
    v_next_classification.marker_color,
    v_updated_point.title,
    v_updated_point.species_name,
    v_updated_point.description,
    v_updated_point.status,
    v_updated_point.is_public,
    st_x(v_updated_point.geom)::double precision as longitude,
    st_y(v_updated_point.geom)::double precision as latitude,
    v_updated_point.created_by,
    v_updated_point.created_at,
    v_updated_point.updated_at,
    public.can_manage_group_points(v_updated_point.group_id) as viewer_can_manage
  from public.groups g
  where g.id = v_updated_point.group_id;
end;
$$;

drop function if exists public.list_point_events(uuid);
create function public.list_point_events(p_point_id uuid)
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
    and public.can_read_point(pe.point_id)
  order by pe.event_date desc, pe.created_at desc;
$$;

drop function if exists public.create_point_event(uuid, uuid, text, text, timestamptz);
drop function if exists public.create_point_event(uuid, text, text, timestamptz);
create function public.create_point_event(
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
security invoker
set search_path = public
as $$
declare
  v_event public.point_events;
  v_point public.points;
  v_event_type public.point_event_types;
  v_resolved_event_type text;
begin
  select *
    into v_point
  from public.points
  where id = p_point_id;

  if v_point.id is null then
    raise exception 'Ponto invalido.';
  end if;

  if p_point_event_type_id is not null then
    select *
      into v_event_type
    from public.point_event_types
    where id = p_point_event_type_id;

    if v_event_type.id is null then
      raise exception 'Tipo de evento invalido.';
    end if;

    if v_event_type.point_classification_id <> v_point.point_classification_id then
      raise exception 'Tipo de evento nao pertence a classificacao do ponto.';
    end if;

    v_resolved_event_type := v_event_type.name;
  else
    v_resolved_event_type := coalesce(nullif(trim(coalesce(p_event_type, '')), ''), 'Evento');
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
    v_resolved_event_type,
    p_description,
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

grant execute on function public.list_point_classifications() to anon, authenticated, service_role;
grant execute on function public.list_point_event_types(uuid) to anon, authenticated, service_role;
grant execute on function public.create_point_classification(text, text, boolean, text) to authenticated, service_role;
grant execute on function public.create_point_event_type(uuid, text, text) to authenticated, service_role;
grant execute on function public.list_points(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.get_point(uuid) to anon, authenticated, service_role;
grant execute on function public.create_point(uuid, uuid, text, double precision, double precision, text, text, boolean, text) to authenticated, service_role;
grant execute on function public.update_point(uuid, uuid, text, text, text, double precision, double precision, boolean, text) to authenticated, service_role;
grant execute on function public.list_point_events(uuid) to anon, authenticated, service_role;
grant execute on function public.create_point_event(uuid, uuid, text, text, timestamptz) to authenticated, service_role;
