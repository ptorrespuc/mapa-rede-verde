create table if not exists public.point_tags (
  id uuid primary key default gen_random_uuid(),
  point_classification_id uuid not null references public.point_classifications (id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (point_classification_id, slug),
  unique (point_classification_id, name)
);

create table if not exists public.point_tag_assignments (
  point_id uuid not null references public.points (id) on delete cascade,
  point_tag_id uuid not null references public.point_tags (id) on delete restrict,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (point_id, point_tag_id)
);

create index if not exists idx_point_tags_classification_id on public.point_tags (point_classification_id);
create index if not exists idx_point_tags_is_active on public.point_tags (is_active);
create index if not exists idx_point_tag_assignments_point_id on public.point_tag_assignments (point_id);
create index if not exists idx_point_tag_assignments_point_tag_id on public.point_tag_assignments (point_tag_id);

drop trigger if exists trg_point_tags_updated_at on public.point_tags;
create trigger trg_point_tags_updated_at
before update on public.point_tags
for each row
execute function public.handle_updated_at();

create or replace function public.ensure_point_tag_assignment_matches_classification()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_point_classification_id uuid;
  v_tag_classification_id uuid;
  v_tag_is_active boolean;
begin
  select p.point_classification_id
    into v_point_classification_id
  from public.points p
  where p.id = new.point_id;

  if v_point_classification_id is null then
    raise exception 'Ponto invalido para associacao de tag.';
  end if;

  select pt.point_classification_id, pt.is_active
    into v_tag_classification_id, v_tag_is_active
  from public.point_tags pt
  where pt.id = new.point_tag_id;

  if v_tag_classification_id is null then
    raise exception 'Tag invalida para associacao.';
  end if;

  if not coalesce(v_tag_is_active, false) then
    raise exception 'Nao e possivel associar uma tag inativa.';
  end if;

  if v_point_classification_id <> v_tag_classification_id then
    raise exception 'A tag nao pertence a classificacao atual do ponto.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_point_tag_assignments_validate on public.point_tag_assignments;
create trigger trg_point_tag_assignments_validate
before insert or update on public.point_tag_assignments
for each row
execute function public.ensure_point_tag_assignment_matches_classification();

alter table public.point_tags enable row level security;
alter table public.point_tag_assignments enable row level security;

drop policy if exists "point_tags_select" on public.point_tags;
create policy "point_tags_select"
on public.point_tags
for select
using (true);

drop policy if exists "point_tags_insert" on public.point_tags;
create policy "point_tags_insert"
on public.point_tags
for insert
with check (public.current_user_is_super_admin());

drop policy if exists "point_tags_update" on public.point_tags;
create policy "point_tags_update"
on public.point_tags
for update
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "point_tags_delete" on public.point_tags;
create policy "point_tags_delete"
on public.point_tags
for delete
using (public.current_user_is_super_admin());

drop policy if exists "point_tag_assignments_select" on public.point_tag_assignments;
create policy "point_tag_assignments_select"
on public.point_tag_assignments
for select
using (public.can_access_point(point_id));

drop policy if exists "point_tag_assignments_insert" on public.point_tag_assignments;
create policy "point_tag_assignments_insert"
on public.point_tag_assignments
for insert
with check (public.current_user_is_super_admin());

drop policy if exists "point_tag_assignments_update" on public.point_tag_assignments;
create policy "point_tag_assignments_update"
on public.point_tag_assignments
for update
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "point_tag_assignments_delete" on public.point_tag_assignments;
create policy "point_tag_assignments_delete"
on public.point_tag_assignments
for delete
using (public.current_user_is_super_admin());

grant select on public.point_tags to anon;
grant select on public.point_tag_assignments to anon;
grant select, insert, update, delete on public.point_tags to authenticated, service_role;
grant select, insert, update, delete on public.point_tag_assignments to authenticated, service_role;

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
      when 'environmental_occurrence' then 'other'::public.point_type
      else 'other'::public.point_type
    end;
$$;

insert into public.point_classifications (slug, name, requires_species, marker_color, is_active)
values
  ('environmental_occurrence', 'Ocorrencia ambiental', false, '#8f4a2c', true)
on conflict (slug) do update
set
  name = excluded.name,
  requires_species = excluded.requires_species,
  marker_color = excluded.marker_color,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

update public.point_classifications
set
  name = 'Arvore',
  requires_species = true,
  marker_color = '#2c8f5d',
  is_active = true,
  updated_at = timezone('utc', now())
where slug = 'tree';

update public.point_classifications
set
  name = 'Local de plantio',
  requires_species = false,
  marker_color = '#bd9f2b',
  is_active = true,
  updated_at = timezone('utc', now())
where slug = 'planting_spot';

create temporary table if not exists pg_temp.legacy_point_classification_snapshot (
  point_id uuid primary key,
  legacy_classification_slug text not null
) on commit drop;

truncate pg_temp.legacy_point_classification_snapshot;

insert into pg_temp.legacy_point_classification_snapshot (point_id, legacy_classification_slug)
select
  p.id,
  pc.slug
from public.points p
join public.point_classifications pc on pc.id = p.point_classification_id
where pc.slug in ('arvores-mudas', 'rvore-base-cimentada', 'gola-com-toco', 'gola_fechads');

with classification_map as (
  select
    max(case when slug = 'tree' then id end) as tree_id,
    max(case when slug = 'planting_spot' then id end) as planting_spot_id,
    max(case when slug = 'environmental_occurrence' then id end) as occurrence_id,
    max(case when slug = 'arvores-mudas' then id end) as legacy_tree_seedling_id,
    max(case when slug = 'rvore-base-cimentada' then id end) as legacy_tree_base_cemented_id,
    max(case when slug = 'gola-com-toco' then id end) as legacy_stump_ring_id,
    max(case when slug = 'gola_fechads' then id end) as legacy_closed_ring_id
  from public.point_classifications
)
update public.points p
set
  point_classification_id = classification_map.tree_id,
  type = public.legacy_point_type_from_classification_slug('tree')
from classification_map
where classification_map.tree_id is not null
  and p.point_classification_id = classification_map.legacy_tree_seedling_id;

with classification_map as (
  select
    max(case when slug = 'environmental_occurrence' then id end) as occurrence_id,
    max(case when slug = 'rvore-base-cimentada' then id end) as legacy_tree_base_cemented_id,
    max(case when slug = 'gola-com-toco' then id end) as legacy_stump_ring_id,
    max(case when slug = 'gola_fechads' then id end) as legacy_closed_ring_id
  from public.point_classifications
)
update public.points p
set
  point_classification_id = classification_map.occurrence_id,
  type = public.legacy_point_type_from_classification_slug('environmental_occurrence')
from classification_map
where classification_map.occurrence_id is not null
  and p.point_classification_id in (
    classification_map.legacy_tree_base_cemented_id,
    classification_map.legacy_stump_ring_id,
    classification_map.legacy_closed_ring_id
  );

update public.point_classifications
set
  is_active = false,
  updated_at = timezone('utc', now())
where slug in ('arvores-mudas', 'rvore-base-cimentada', 'gola-com-toco', 'gola_fechads');

with classification_map as (
  select
    max(case when pc.slug = 'tree' then pc.id end) as tree_id,
    max(case when pc.slug = 'planting_spot' then pc.id end) as planting_spot_id,
    max(case when pc.slug = 'environmental_occurrence' then pc.id end) as occurrence_id
  from public.point_classifications pc
)
insert into public.point_tags (
  point_classification_id,
  slug,
  name,
  description,
  is_active
)
select
  seed.point_classification_id,
  seed.slug,
  seed.name,
  seed.description,
  true
from classification_map cross join lateral (
  values
    (classification_map.tree_id, 'muda', 'Muda', 'Indica arvore jovem ou recem-implantada.'),
    (classification_map.tree_id, 'recem-plantada', 'Recem-plantada', 'Indica plantio recente que demanda acompanhamento.'),
    (classification_map.tree_id, 'sob-fiacao', 'Sob fiacao', 'Arvore localizada sob rede aerea.'),
    (classification_map.tree_id, 'necessita-manejo', 'Necessita manejo', 'Arvore que demanda avaliacao ou intervencao.'),
    (classification_map.planting_spot_id, 'prioritario', 'Prioritario', 'Local priorizado para futuro plantio.'),
    (classification_map.planting_spot_id, 'necessita-abertura', 'Necessita abertura', 'Local demanda adequacao antes do plantio.'),
    (classification_map.occurrence_id, 'gola-cimentada', 'Gola cimentada', 'Base da arvore impermeabilizada ou cimentada.'),
    (classification_map.occurrence_id, 'gola-fechada', 'Gola fechada', 'Local com fechamento inadequado da gola.'),
    (classification_map.occurrence_id, 'corte-realizado', 'Corte realizado', 'Registro de corte ou supressao da arvore.'),
    (classification_map.occurrence_id, 'destoca-pendente', 'Destoca pendente', 'Toco ou raiz ainda demandando remocao.'),
    (classification_map.occurrence_id, 'vandalismo', 'Vandalismo', 'Ocorrencia associada a dano provocado por terceiros.'),
    (classification_map.occurrence_id, 'crime-ambiental', 'Crime ambiental', 'Ocorrencia com indicio de infracao ambiental.')
) as seed(point_classification_id, slug, name, description)
where seed.point_classification_id is not null
on conflict (point_classification_id, slug) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

with tree_points as (
  select snapshot.point_id, pt.id as point_tag_id
  from pg_temp.legacy_point_classification_snapshot snapshot
  join public.points p on p.id = snapshot.point_id
  join public.point_tags pt
    on pt.point_classification_id = p.point_classification_id
   and pt.slug = 'muda'
  where snapshot.legacy_classification_slug = 'arvores-mudas'
)
insert into public.point_tag_assignments (point_id, point_tag_id, created_by)
select
  tree_points.point_id,
  tree_points.point_tag_id,
  null
from tree_points
on conflict (point_id, point_tag_id) do nothing;

with occurrence_points as (
  select
    snapshot.point_id,
    snapshot.legacy_classification_slug as legacy_slug
  from pg_temp.legacy_point_classification_snapshot snapshot
  join public.points p on p.id = snapshot.point_id
  join public.point_classifications pc on pc.id = p.point_classification_id
  where pc.slug = 'environmental_occurrence'
),
resolved_tags as (
  select
    point_id,
    case legacy_slug
      when 'rvore-base-cimentada' then array['gola-cimentada', 'crime-ambiental']::text[]
      when 'gola-com-toco' then array['corte-realizado', 'destoca-pendente']::text[]
      when 'gola_fechads' then array['gola-fechada']::text[]
      else array[]::text[]
    end as tag_slugs
  from occurrence_points
  where legacy_slug is not null
),
expanded_tags as (
  select
    resolved_tags.point_id,
    unnest(resolved_tags.tag_slugs) as tag_slug
  from resolved_tags
),
tag_targets as (
  select
    expanded_tags.point_id,
    pt.id as point_tag_id
  from expanded_tags
  join public.points p on p.id = expanded_tags.point_id
  join public.point_tags pt
    on pt.point_classification_id = p.point_classification_id
   and pt.slug = expanded_tags.tag_slug
)
insert into public.point_tag_assignments (point_id, point_tag_id, created_by)
select
  tag_targets.point_id,
  tag_targets.point_tag_id,
  null
from tag_targets
on conflict (point_id, point_tag_id) do nothing;

drop function if exists public.list_point_tags(uuid, boolean);
create function public.list_point_tags(
  p_point_classification_id uuid default null,
  p_only_active boolean default true
)
returns table (
  id uuid,
  point_classification_id uuid,
  point_classification_name text,
  slug text,
  name text,
  description text,
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
    pt.id,
    pt.point_classification_id,
    pc.name as point_classification_name,
    pt.slug,
    pt.name,
    pt.description,
    pt.is_active,
    pt.created_at,
    pt.updated_at
  from public.point_tags pt
  join public.point_classifications pc on pc.id = pt.point_classification_id
  where (p_point_classification_id is null or pt.point_classification_id = p_point_classification_id)
    and (not coalesce(p_only_active, true) or pt.is_active)
  order by pc.name asc, pt.name asc;
$$;

drop function if exists public.list_point_tag_assignments(uuid[]);
create function public.list_point_tag_assignments(p_point_ids uuid[] default null)
returns table (
  point_id uuid,
  tag_id uuid,
  point_classification_id uuid,
  slug text,
  name text,
  description text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pta.point_id,
    pt.id as tag_id,
    pt.point_classification_id,
    pt.slug,
    pt.name,
    pt.description,
    pt.is_active
  from public.point_tag_assignments pta
  join public.point_tags pt on pt.id = pta.point_tag_id
  where (p_point_ids is null or pta.point_id = any(p_point_ids))
    and public.can_access_point(pta.point_id)
  order by pt.name asc;
$$;

grant execute on function public.list_point_tags(uuid, boolean) to anon, authenticated, service_role;
grant execute on function public.list_point_tag_assignments(uuid[]) to anon, authenticated, service_role;
