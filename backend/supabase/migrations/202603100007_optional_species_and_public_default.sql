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
  v_group public.groups;
  v_classification public.point_classifications;
  v_species public.species;
begin
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
    case
      when v_classification.requires_species then v_species.id
      else null
    end,
    case
      when v_classification.requires_species and v_species.id is not null
        then public.format_species_label(v_species.common_name, v_species.scientific_name)
      else null
    end,
    p_description,
    coalesce(nullif(p_status, ''), 'active'),
    case
      when v_group.is_public then coalesce(p_is_public, true)
      else false
    end,
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
    coalesce(
      public.format_species_label(v_species.common_name, v_species.scientific_name),
      v_point.species_name
    ),
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
  p_species_id uuid default null,
  p_species_id_provided boolean default false
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
  v_group public.groups;
  v_previous_classification public.point_classifications;
  v_next_classification public.point_classifications;
  v_target_species_id uuid;
  v_next_species public.species;
begin
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

  update public.points as p
  set
    type = public.legacy_point_type_from_classification_slug(v_next_classification.slug),
    point_classification_id = v_next_classification.id,
    title = coalesce(p_title, p.title),
    species_id = case
      when v_next_classification.requires_species then v_target_species_id
      else null
    end,
    species_name = case
      when v_next_classification.requires_species and v_next_species.id is not null
        then public.format_species_label(v_next_species.common_name, v_next_species.scientific_name)
      else null
    end,
    description = coalesce(p_description, p.description),
    status = coalesce(p_status, p.status),
    is_public = case
      when v_group.is_public then coalesce(p_is_public, p.is_public)
      else false
    end,
    geom = case
      when p_longitude is not null and p_latitude is not null
        then st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)
      else p.geom
    end
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
    coalesce(
      public.format_species_label(v_next_species.common_name, v_next_species.scientific_name),
      v_updated_point.species_name
    ),
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

grant execute on function public.create_point(uuid, uuid, text, double precision, double precision, text, text, boolean, uuid) to authenticated, service_role;
grant execute on function public.update_point(uuid, uuid, text, text, text, double precision, double precision, boolean, uuid, boolean) to authenticated, service_role;
