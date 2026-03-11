create table if not exists public.species (
  id uuid primary key default gen_random_uuid(),
  common_name text not null,
  scientific_name text not null,
  origin text not null default 'native' check (origin in ('native', 'exotic')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (scientific_name)
);

create index if not exists idx_species_common_name on public.species (common_name);
create index if not exists idx_species_origin on public.species (origin);
create index if not exists idx_species_is_active on public.species (is_active);

alter table public.points
  add column if not exists species_id uuid references public.species (id);

create index if not exists idx_points_species_id on public.points (species_id);

drop trigger if exists trg_species_updated_at on public.species;
create trigger trg_species_updated_at
before update on public.species
for each row
execute function public.handle_updated_at();

create or replace function public.format_species_label(
  p_common_name text,
  p_scientific_name text
)
returns text
language sql
immutable
as $$
  select
    case
      when nullif(trim(coalesce(p_scientific_name, '')), '') is null then trim(coalesce(p_common_name, ''))
      else trim(coalesce(p_common_name, '')) || ' (' || trim(coalesce(p_scientific_name, '')) || ')'
    end;
$$;

insert into public.species (common_name, scientific_name, origin, is_active)
values
  ('Oiti', 'Licania tomentosa', 'native', true),
  ('Sibipiruna', 'Poincianella pluviosa var. peltophoroides', 'native', true),
  ('Pau-ferro', 'Libidibia ferrea', 'native', true),
  ('Paineira-rosa', 'Ceiba speciosa', 'native', true),
  ('Quaresmeira', 'Tibouchina granulosa', 'native', true),
  ('Manaca-da-serra', 'Tibouchina mutabilis', 'native', true),
  ('Ipe-amarelo', 'Handroanthus albus', 'native', true),
  ('Ipe-roxo', 'Handroanthus impetiginosus', 'native', true),
  ('Pitangueira', 'Eugenia uniflora', 'native', true),
  ('Jatoba', 'Hymenaea courbaril', 'native', true),
  ('Aroeira', 'Schinus terebinthifolia', 'native', true),
  ('Pau-brasil', 'Paubrasilia echinata', 'native', true),
  ('Aldrago', 'Pterocarpus rohrii', 'native', true),
  ('Pata-de-vaca', 'Bauhinia forficata', 'native', true),
  ('Babosa-branca', 'Cordia superba', 'native', true),
  ('Flamboyant', 'Delonix regia', 'exotic', true),
  ('Reseda', 'Lagerstroemia indica', 'exotic', true),
  ('Jacaranda-mimoso', 'Jacaranda mimosifolia', 'exotic', true),
  ('Aroeira-salsa', 'Schinus molle', 'exotic', true),
  ('Amendoeira-da-praia', 'Terminalia catappa', 'exotic', true),
  ('Ficus-benjamina', 'Ficus benjamina', 'exotic', true),
  ('Neem', 'Azadirachta indica', 'exotic', true)
on conflict (scientific_name) do update
set
  common_name = excluded.common_name,
  origin = excluded.origin,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

update public.points p
set
  species_id = s.id,
  species_name = public.format_species_label(s.common_name, s.scientific_name)
from public.species s
where p.species_id is null
  and nullif(trim(coalesce(p.species_name, '')), '') is not null
  and (
    lower(p.species_name) = lower(public.format_species_label(s.common_name, s.scientific_name))
    or lower(p.species_name) = lower(s.common_name)
    or lower(p.species_name) = lower(s.scientific_name)
  );

alter table public.species enable row level security;

drop policy if exists "species_select" on public.species;
create policy "species_select"
on public.species
for select
using (true);

drop policy if exists "species_insert" on public.species;
create policy "species_insert"
on public.species
for insert
with check (public.current_user_is_super_admin());

drop policy if exists "species_update" on public.species;
create policy "species_update"
on public.species
for update
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "species_delete" on public.species;
create policy "species_delete"
on public.species
for delete
using (public.current_user_is_super_admin());

grant select on public.species to anon;
grant select, insert, update, delete on public.species to authenticated, service_role;

drop function if exists public.list_species(boolean);
create function public.list_species(p_only_active boolean default true)
returns table (
  id uuid,
  common_name text,
  scientific_name text,
  origin text,
  display_name text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.common_name,
    s.scientific_name,
    s.origin,
    public.format_species_label(s.common_name, s.scientific_name) as display_name,
    s.is_active,
    s.created_at,
    s.updated_at
  from public.species s
  where not p_only_active or s.is_active
  order by s.common_name asc, s.scientific_name asc;
$$;

drop function if exists public.create_species(text, text, text, boolean);
create function public.create_species(
  p_common_name text,
  p_scientific_name text,
  p_origin text default 'native',
  p_is_active boolean default true
)
returns table (
  id uuid,
  common_name text,
  scientific_name text,
  origin text,
  display_name text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_species public.species;
  v_origin text;
begin
  v_origin := lower(coalesce(nullif(trim(p_origin), ''), 'native'));

  if v_origin not in ('native', 'exotic') then
    raise exception 'Origem invalida. Use native ou exotic.';
  end if;

  insert into public.species (
    common_name,
    scientific_name,
    origin,
    is_active
  )
  values (
    trim(p_common_name),
    trim(p_scientific_name),
    v_origin,
    coalesce(p_is_active, true)
  )
  returning * into v_species;

  return query
  select
    v_species.id,
    v_species.common_name,
    v_species.scientific_name,
    v_species.origin,
    public.format_species_label(v_species.common_name, v_species.scientific_name),
    v_species.is_active,
    v_species.created_at,
    v_species.updated_at;
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
  group_is_public boolean,
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
    p.species_id,
    coalesce(public.format_species_label(s.common_name, s.scientific_name), p.species_name) as species_name,
    s.common_name as species_common_name,
    s.scientific_name as species_scientific_name,
    s.origin as species_origin,
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
  left join public.species s on s.id = p.species_id
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
  species_id uuid,
  species_name text,
  species_common_name text,
  species_scientific_name text,
  species_origin text,
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
    p.species_id,
    coalesce(public.format_species_label(s.common_name, s.scientific_name), p.species_name) as species_name,
    s.common_name as species_common_name,
    s.scientific_name as species_scientific_name,
    s.origin as species_origin,
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
  left join public.species s on s.id = p.species_id
  where p.id = p_point_id
    and public.can_read_group_point(p.group_id, p.is_public)
  limit 1;
$$;

drop function if exists public.create_point(uuid, uuid, text, double precision, double precision, text, text, boolean, text);
drop function if exists public.create_point(uuid, uuid, text, double precision, double precision, text, text, boolean, uuid);
create function public.create_point(
  p_group_id uuid,
  p_point_classification_id uuid,
  p_title text,
  p_longitude double precision,
  p_latitude double precision,
  p_description text default null,
  p_status text default 'active',
  p_is_public boolean default false,
  p_species_id uuid default null
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
  species_id uuid,
  species_name text,
  species_common_name text,
  species_scientific_name text,
  species_origin text,
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
  v_species public.species;
begin
  select *
    into v_classification
  from public.point_classifications
  where id = p_point_classification_id;

  if v_classification.id is null then
    raise exception 'Classificacao de ponto invalida.';
  end if;

  if p_species_id is not null then
    select *
      into v_species
    from public.species
    where id = p_species_id
      and is_active;

    if v_species.id is null then
      raise exception 'Especie invalida.';
    end if;
  end if;

  if v_classification.requires_species and v_species.id is null then
    raise exception 'Selecione uma especie do catalogo para esta classificacao de ponto.';
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
    geom,
    created_by
  )
  values (
    p_group_id,
    public.legacy_point_type_from_classification_slug(v_classification.slug),
    v_classification.id,
    p_title,
    case when v_classification.requires_species then v_species.id else null end,
    case
      when v_classification.requires_species
        then public.format_species_label(v_species.common_name, v_species.scientific_name)
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
    v_classification.id,
    v_classification.slug,
    v_classification.name,
    v_classification.requires_species,
    v_classification.marker_color,
    v_point.title,
    v_point.species_id,
    coalesce(public.format_species_label(v_species.common_name, v_species.scientific_name), v_point.species_name),
    v_species.common_name,
    v_species.scientific_name,
    v_species.origin,
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
drop function if exists public.update_point(uuid, uuid, text, text, text, double precision, double precision, boolean, uuid);
create function public.update_point(
  p_point_id uuid,
  p_point_classification_id uuid default null,
  p_title text default null,
  p_description text default null,
  p_status text default null,
  p_longitude double precision default null,
  p_latitude double precision default null,
  p_is_public boolean default null,
  p_species_id uuid default null
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
  species_id uuid,
  species_name text,
  species_common_name text,
  species_scientific_name text,
  species_origin text,
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
  v_target_species_id uuid;
  v_next_species public.species;
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

  if v_next_classification.requires_species then
    v_target_species_id := coalesce(p_species_id, v_existing_point.species_id);
  else
    v_target_species_id := null;
  end if;

  if v_target_species_id is not null then
    select *
      into v_next_species
    from public.species
    where id = v_target_species_id
      and is_active;

    if v_next_species.id is null then
      raise exception 'Especie invalida.';
    end if;
  end if;

  if v_next_classification.requires_species and v_next_species.id is null then
    raise exception 'Selecione uma especie do catalogo para esta classificacao de ponto.';
  end if;

  update public.points
  set
    type = public.legacy_point_type_from_classification_slug(v_next_classification.slug),
    point_classification_id = v_next_classification.id,
    title = coalesce(p_title, title),
    species_id = case
      when v_next_classification.requires_species then v_next_species.id
      else null
    end,
    species_name = case
      when v_next_classification.requires_species
        then public.format_species_label(v_next_species.common_name, v_next_species.scientific_name)
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
    v_updated_point.species_id,
    coalesce(public.format_species_label(v_next_species.common_name, v_next_species.scientific_name), v_updated_point.species_name),
    v_next_species.common_name,
    v_next_species.scientific_name,
    v_next_species.origin,
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

grant execute on function public.list_species(boolean) to anon, authenticated, service_role;
grant execute on function public.create_species(text, text, text, boolean) to authenticated, service_role;
grant execute on function public.list_points(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.get_point(uuid) to anon, authenticated, service_role;
grant execute on function public.create_point(uuid, uuid, text, double precision, double precision, text, text, boolean, uuid) to authenticated, service_role;
grant execute on function public.update_point(uuid, uuid, text, text, text, double precision, double precision, boolean, uuid) to authenticated, service_role;
