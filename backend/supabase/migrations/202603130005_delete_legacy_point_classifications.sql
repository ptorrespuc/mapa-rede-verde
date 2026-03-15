delete from public.point_classifications
where slug in ('arvores-mudas', 'rvore-base-cimentada', 'gola-com-toco', 'gola_fechads')
  and not exists (
    select 1
    from public.points p
    where p.point_classification_id = public.point_classifications.id
  )
  and not exists (
    select 1
    from public.point_event_types pet
    where pet.point_classification_id = public.point_classifications.id
  )
  and not exists (
    select 1
    from public.point_tags pt
    where pt.point_classification_id = public.point_classifications.id
  );
