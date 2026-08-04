-- 카테고리가 시설 민원 분류(불편·고장·위험)여서 제품이 민원함으로 읽혔다.
-- 행사 회고·포스터·앱 UI 어디에 붙여도 말이 되는 중립 어휘로 바꾸고, 긍정(praise)을 1급으로 넣는다.
-- 문제만 모으면 민원이고, 잘된 점과 아쉬운 점을 같이 받아야 피드백이다.

alter table public.feedback_pins alter column category drop default;
alter type public.feedback_category rename to feedback_category_complaint;
create type public.feedback_category as enum ('praise', 'improve', 'confusing', 'bug', 'idea');

alter table public.feedback_pins
alter column category type public.feedback_category
using (
  case category::text
    when 'discomfort' then 'improve'
    when 'broken' then 'bug'
    when 'danger' then 'improve'
    when 'suggestion' then 'idea'
    else 'idea'
  end
)::public.feedback_category;

alter table public.feedback_pins alter column category set default 'improve';
drop type public.feedback_category_complaint;

-- 컬럼 권한은 attnum 에 붙지만, 타입 변경이 재작성을 동반하므로 의도한 상태를 다시 못박아 둔다.
-- 좌표(x, y)와 campaign_id, created_at 은 여전히 아무도 못 바꾼다.
revoke update on public.feedback_pins from authenticated;
grant update (category, body, hidden, updated_at) on public.feedback_pins to authenticated;
