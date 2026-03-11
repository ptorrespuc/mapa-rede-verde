create or replace function public.normalize_group_code(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(
      left(
        regexp_replace(
          lower(
            regexp_replace(
              coalesce(trim(p_value), ''),
              '^@+',
              '',
              'g'
            )
          ),
          '[^a-z0-9._-]+',
          '',
          'g'
        ),
        48
      ),
      ''
    ),
    'grupo'
  );
$$;

create or replace function public.generate_available_group_code(
  p_label text,
  p_ignore_group_id uuid default null
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_base text := public.normalize_group_code(p_label);
  v_candidate text := v_base;
  v_counter integer := 1;
begin
  loop
    exit when not exists (
      select 1
      from public.groups g
      where g.code = v_candidate
        and (p_ignore_group_id is null or g.id <> p_ignore_group_id)
    );

    v_counter := v_counter + 1;
    v_candidate :=
      left(v_base, greatest(1, 48 - length(v_counter::text)))
      || v_counter::text;
  end loop;

  return v_candidate;
end;
$$;

create or replace function public.assign_group_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.code is null or btrim(new.code) = '' then
      new.code := public.generate_available_group_code(new.name);
    else
      new.code := public.generate_available_group_code(new.code, new.id);
    end if;
  elsif new.code is distinct from old.code then
    if new.code is null or btrim(new.code) = '' then
      new.code := old.code;
    else
      new.code := public.generate_available_group_code(new.code, new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_groups_assign_code on public.groups;
create trigger trg_groups_assign_code
before insert or update of code on public.groups
for each row
execute function public.assign_group_code();

do $$
declare
  v_group record;
begin
  for v_group in
    select g.id, g.code
    from public.groups g
    where g.code is not null
  loop
    update public.groups
    set code = public.generate_available_group_code(v_group.code, v_group.id)
    where id = v_group.id;
  end loop;
end;
$$;

drop function if exists public.create_group(text, boolean, boolean);
create function public.create_group(
  p_name text,
  p_code text default null,
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
    code,
    is_public,
    accepts_point_collaboration
  )
  values (
    trim(p_name),
    nullif(trim(coalesce(p_code, '')), ''),
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

grant execute on function public.create_group(text, text, boolean, boolean) to authenticated, service_role;
