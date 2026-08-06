import assert from "node:assert/strict";
import test from "node:test";
import { mergeAudiencePages, pagesForAudience, type CampaignPage } from "./types.ts";

const page = (id: string, pageIndex: number, audienceGroups: CampaignPage["audienceGroups"]): CampaignPage => ({
  id,
  campaignId: "campaign",
  pageIndex,
  imageUrl: `/${id}.jpg`,
  imagePath: `${id}.jpg`,
  imageWidth: 100,
  imageHeight: 100,
  audienceGroups,
});

test("참여 유형에 공개된 페이지만 원래 순서대로 보여준다", () => {
  const pages = [
    page("shared", 0, ["design_sprint", "event"]),
    page("ai", 1, ["ai_playground"]),
    page("admin", 2, []),
  ];

  assert.deepEqual(pagesForAudience(pages, "event").map(({ id }) => id), ["shared"]);
  assert.deepEqual(pagesForAudience(pages, "ai_playground").map(({ id }) => id), ["ai"]);
});

test("한 유형을 다시 조회해도 관리자 전용·다른 유형 페이지는 보존한다", () => {
  const current = [
    page("old-design", 0, ["design_sprint"]),
    page("ai", 1, ["ai_playground"]),
    page("admin", 2, []),
  ];
  const incoming = [page("new-design", 3, ["design_sprint", "event"])];

  assert.deepEqual(
    mergeAudiencePages(current, incoming, "design_sprint").map(({ id }) => id),
    ["ai", "admin", "new-design"]
  );
});
