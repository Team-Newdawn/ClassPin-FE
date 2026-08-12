import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMPAIGN_REACTION_LANES,
  parseCampaignReaction,
  scheduleCampaignReaction
} from "./reactions.ts";

test("허용된 이모지 페이로드만 플레이어에 전달한다", () => {
  assert.deepEqual(parseCampaignReaction({ id: "reaction-1", emoji: "👏" }), { id: "reaction-1", emoji: "👏" });
  assert.equal(parseCampaignReaction({ id: "reaction-2", emoji: "🔥" }), null);
  assert.equal(parseCampaignReaction({ id: "", emoji: "👏" }), null);
});

test("동시에 들어온 반응은 빈 레인부터 사용하고 모든 레인이 차면 시간차를 둔다", () => {
  let readyAt = CAMPAIGN_REACTION_LANES.map(() => 0);
  const firstWave = CAMPAIGN_REACTION_LANES.map(() => {
    const scheduled = scheduleCampaignReaction(readyAt, 1_000);
    readyAt = scheduled.nextReadyAt;
    return scheduled;
  });
  const next = scheduleCampaignReaction(readyAt, 1_000);

  assert.deepEqual(firstWave.map(({ lane }) => lane), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(firstWave.every(({ delay }) => delay === 0));
  assert.equal(next.lane, 0);
  assert.equal(next.delay, 350);
});
