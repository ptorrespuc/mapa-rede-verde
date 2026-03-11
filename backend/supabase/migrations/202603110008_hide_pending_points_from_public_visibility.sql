drop function if exists public.can_read_point_record(
  uuid,
  uuid,
  boolean,
  public.point_approval_status,
  uuid
);

create function public.can_read_point_record(
  target_point_id uuid,
  target_group_id uuid,
  target_point_is_public boolean,
  target_approval_status public.point_approval_status,
  target_created_by uuid,
  target_has_pending_update boolean,
  target_pending_update_requested_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when target_approval_status = 'approved'::public.point_approval_status
        and not coalesce(target_has_pending_update, false) then
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
        or (
          coalesce(target_has_pending_update, false)
          and target_pending_update_requested_by = public.current_app_user_id()
        )
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
        p.created_by,
        p.pending_update_data is not null,
        p.pending_update_requested_by
      )
  );
$$;

drop policy if exists "points_select" on public.points;
create policy "points_select"
on public.points
for select
using (
  public.can_read_point_record(
    id,
    group_id,
    is_public,
    approval_status,
    created_by,
    pending_update_data is not null,
    pending_update_requested_by
  )
);

create or replace function public.list_points(
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
  where p.approval_status in (
      'approved'::public.point_approval_status,
      'pending'::public.point_approval_status
    )
    and (p_point_classification_id is null or p.classification_id = p_point_classification_id)
    and (p_group_id is null or p.group_id = p_group_id)
    and public.can_read_point_record(
      p.id,
      p.group_id,
      p.is_public,
      p.approval_status,
      p.created_by,
      p.has_pending_update,
      p.pending_update_requested_by
    )
  order by p.created_at desc;
$$;

create or replace function public.list_workspace_points(
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
      p.created_by,
      p.has_pending_update,
      p.pending_update_requested_by
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
      p.created_by,
      p.has_pending_update,
      p.pending_update_requested_by
    )
  limit 1;
$$;
