-- 플레이어 URL을 가진 사람은 로그인 화면 없이 발표 내용을 볼 수 있다.
-- 관리자용 SELECT 정책은 그대로 두고, 플레이어에 필요한 공개 필드만 한 RPC로 제한한다.
create or replace function private.find_campaign_player(target_campaign_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', campaign.id,
      'title', campaign.title,
      'guide_text', campaign.guide_text,
      'join_code', campaign.join_code,
      'image_path', campaign.image_path,
      'image_width', campaign.image_width,
      'image_height', campaign.image_height,
      'status', campaign.status,
      'show_presentation_qr', campaign.show_presentation_qr,
      'presentation_qr_position', campaign.presentation_qr_position,
      'audience_groups', campaign.audience_groups,
      'feedback_categories', campaign.feedback_categories,
      'created_at', campaign.created_at
    ),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id,
        'campaign_id', page.campaign_id,
        'page_index', page.page_index,
        'image_path', page.image_path,
        'image_width', page.image_width,
        'image_height', page.image_height,
        'audience_groups', page.audience_groups
      ) order by page.page_index)
      from public.campaign_pages as page
      where page.campaign_id = campaign.id
    ), '[]'::jsonb),
    'pins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pin.id,
        'campaign_id', pin.campaign_id,
        'author_id', null,
        'page_index', pin.page_index,
        'x', pin.x,
        'y', pin.y,
        'category', pin.category,
        'body', pin.body,
        'hidden', false,
        'created_at', pin.created_at
      ) order by pin.created_at desc)
      from public.feedback_pins as pin
      where pin.campaign_id = campaign.id and pin.hidden = false
    ), '[]'::jsonb)
  )
  from public.campaigns as campaign
  where (select auth.uid()) is not null
    and campaign.id = target_campaign_id
    and campaign.status in ('live', 'ended');
$$;

revoke all on function private.find_campaign_player(uuid) from public, anon, authenticated;
grant execute on function private.find_campaign_player(uuid) to authenticated;

create or replace function public.find_campaign_player(target_campaign_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.find_campaign_player(target_campaign_id);
$$;

revoke all on function public.find_campaign_player(uuid) from public, anon, authenticated;
grant execute on function public.find_campaign_player(uuid) to authenticated;

notify pgrst, 'reload schema';
