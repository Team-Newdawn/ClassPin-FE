-- Existing OhPin participant contract, synchronized from ClassPin-BE.
-- Retain caller RLS and commit the point anchor and question together.
create or replace function public.ohpin_submit_point_question(
  target_id uuid,target_lecture_id uuid,target_slide_id uuid,target_x double precision,target_y double precision,
  target_category text,target_marker text,target_text text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  course uuid;
  version uuid;
  region uuid := gen_random_uuid();
begin
  if not (select private.is_participant()) then
    raise exception 'Participant access required' using errcode = '42501';
  end if;
  if target_x is null or target_y is null or not (target_x between 0 and 1) or not (target_y between 0 and 1) then
    raise exception 'Invalid point coordinates' using errcode = '22023';
  end if;
  select m.course_id,s.material_version_id into course,version
  from public.slides s join public.material_versions mv on mv.id=s.material_version_id
  join public.materials m on m.id=mv.material_id join public.lectures l on l.id=m.lecture_id
  where s.id=target_slide_id and l.id=target_lecture_id and l.status='live' and l.presentation_interactions;
  if not found then raise exception 'Live slide unavailable' using errcode = '42501'; end if;
  insert into public.region_anchors(id,slide_id,material_version_id,kind,coords,created_by)
  values(region,target_slide_id,version,'point',jsonb_build_object('x',target_x,'y',target_y),'user');
  insert into public.questions(id,course_id,lecture_id,slide_id,region_id,author_id,is_anonymous,category,marker,raw_text,status,occurred_in)
  values(target_id,course,target_lecture_id,target_slide_id,region,(select auth.uid()),true,target_category,target_marker,btrim(target_text),'unanswered','live');
  return target_id;
end;
$$;
revoke all on function public.ohpin_submit_point_question(uuid,uuid,uuid,double precision,double precision,text,text,text) from public,anon,authenticated;
grant execute on function public.ohpin_submit_point_question(uuid,uuid,uuid,double precision,double precision,text,text,text) to authenticated;

