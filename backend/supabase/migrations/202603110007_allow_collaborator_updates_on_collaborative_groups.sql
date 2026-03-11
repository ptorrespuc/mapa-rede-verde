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
    or public.can_submit_group_points(target_group_id);
$$;

create or replace function public.update_point(
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
  v_can_approve boolean;
  v_is_creator boolean;
  v_effective_is_public boolean;
  v_effective_status text;
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

  if p_point_classification_id is null then
    v_next_classification := v_previous_classification;
  else
    select *
      into v_next_classification
    from public.point_classifications pc
    where pc.id = p_point_classification_id
      and pc.is_active;
  end if;

  if v_next_classification.id is null then
    raise exception 'Classificacao de ponto invalida.';
  end if;

  v_can_manage := public.can_manage_group_points(v_existing_point.group_id);
  v_can_submit := public.can_submit_group_points(v_existing_point.group_id);
  v_can_approve := public.can_approve_group_points(v_existing_point.group_id);
  v_is_creator := v_existing_point.created_by = v_actor_id;

  if not v_can_approve and not v_can_submit then
    raise exception 'Voce nao tem permissao para alterar este ponto.';
  end if;

  if not v_can_approve and v_existing_point.approval_status = 'approved'::public.point_approval_status then
    perform public.enforce_pending_point_limit(v_existing_point.group_id, v_actor_id, v_existing_point.id);
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
      when v_can_manage and v_group.is_public then coalesce(p_is_public, v_existing_point.is_public)
      when v_group.is_public then v_existing_point.is_public
      else false
    end;
  v_effective_status :=
    case
      when v_existing_point.status = 'archived' then 'archived'
      else 'active'
    end;

  if v_can_approve or v_existing_point.approval_status <> 'approved'::public.point_approval_status then
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
      status = v_effective_status,
      is_public = v_effective_is_public,
      approval_status = case
        when v_can_approve then 'approved'::public.point_approval_status
        else 'pending'::public.point_approval_status
      end,
      approved_by = case
        when v_can_approve then v_actor_id
        else null
      end,
      approved_at = case
        when v_can_approve then timezone('utc', now())
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
      'status', v_effective_status,
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

  if v_can_approve and v_previous_classification.id is distinct from v_next_classification.id then
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
      public.build_reclassification_event_description(
        v_previous_classification.name,
        v_updated_point.title,
        v_updated_point.species_name,
        v_updated_point.description,
        st_y(v_updated_point.geom)::double precision,
        st_x(v_updated_point.geom)::double precision,
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

grant execute on function public.update_point(uuid, uuid, text, text, text, double precision, double precision, boolean, uuid, boolean) to authenticated, service_role;
