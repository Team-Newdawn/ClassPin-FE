begin;

alter table public.campaigns
add column presentation_autoplay boolean not null default true;

comment on column public.campaigns.presentation_autoplay is
'Whether slides and feedback PINs advance automatically in the feedback player.';

-- 공개 플레이어는 campaigns를 직접 읽지 못하므로 기존 제한 RPC에 설정을 포함한다.
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
      'presentation_autoplay', campaign.presentation_autoplay,
      'show_presentation_pin_status', campaign.show_presentation_pin_status,
      'presentation_pin_status_position', campaign.presentation_pin_status_position,
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
        'marker', pin.marker,
        'reaction_count', pin.reaction_count,
        'reacted_by_me', exists (
          select 1
          from public.feedback_pin_reactions as reaction
          where reaction.pin_id = pin.id
            and reaction.reactor_id = (select auth.uid())
        ),
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

notify pgrst, 'reload schema';

commit;
