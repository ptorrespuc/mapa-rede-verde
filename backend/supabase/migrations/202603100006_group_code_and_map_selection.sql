alter table public.groups
  add column if not exists code text;

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
          regexp_replace(
            lower(
              translate(
                coalesce(trim(p_value), ''),
                'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
                'aaaaaaeeeeiiiiooooouuuucnyyaaaaaaeeeeiiiiooooouuuucny'
              )
            ),
            '[^a-z0-9]+',
            '-',
            'g'
          ),
          '(^-|-$)',
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
      left(v_base, greatest(1, 48 - length(v_counter::text) - 1))
      || '-'
      || v_counter::text;
  end loop;

  return v_candidate;
end;
$$;

do $$
declare
  v_group record;
begin
  for v_group in
    select g.id, g.name
    from public.groups g
    where g.code is null or btrim(g.code) = ''
    order by g.created_at, g.id
  loop
    update public.groups
    set code = public.generate_available_group_code(v_group.name, v_group.id)
    where id = v_group.id;
  end loop;
end;
$$;

create or replace function public.assign_group_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := public.generate_available_group_code(new.name);
  else
    new.code := public.generate_available_group_code(new.code, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_groups_assign_code on public.groups;
create trigger trg_groups_assign_code
before insert on public.groups
for each row
execute function public.assign_group_code();

create unique index if not exists idx_groups_code on public.groups (code);

alter table public.groups
  alter column code set not null;

drop function if exists public.list_groups();
create function public.list_groups()
returns table (
  id uuid,
  name text,
  code text,
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
    g.code,
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

drop function if exists public.create_group(text, boolean);
create function public.create_group(
  p_name text,
  p_is_public boolean default false
)
returns table (
  id uuid,
  name text,
  code text,
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
  select v_group.id, v_group.name, v_group.code, v_group.is_public, v_group.created_at;
end;
$$;
