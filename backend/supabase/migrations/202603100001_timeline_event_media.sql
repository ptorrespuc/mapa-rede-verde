alter table public.point_media
  add column if not exists point_event_id uuid references public.point_events (id) on delete cascade;

create index if not exists idx_point_media_point_event_id on public.point_media (point_event_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'point-timeline-media',
  'point-timeline-media',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
