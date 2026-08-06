import assert from "node:assert/strict";
import test from "node:test";
import { mergeAudiencePages, normalizeAudienceGroups, pagesForAudience, type CampaignPage } from "./types.ts";

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
    page("shared", 0, ["오전 세션", "현장 참여자"]),
    page("remote", 1, ["온라인 참여자"]),
    page("admin", 2, []),
  ];

  assert.deepEqual(pagesForAudience(pages, "현장 참여자").map(({ id }) => id), ["shared"]);
  assert.deepEqual(pagesForAudience(pages, "온라인 참여자").map(({ id }) => id), ["remote"]);
});

test("한 유형을 다시 조회해도 관리자 전용·다른 유형 페이지는 보존한다", () => {
  const current = [
    page("old-morning", 0, ["오전 세션"]),
    page("afternoon", 1, ["오후 세션"]),
    page("admin", 2, []),
  ];
  const incoming = [page("new-morning", 3, ["오전 세션", "현장 참여자"])];

  assert.deepEqual(
    mergeAudiencePages(current, incoming, "오전 세션").map(({ id }) => id),
    ["afternoon", "admin", "new-morning"]
  );
});

test("DB에서 받은 그룹은 유효한 고유 이름만 사용한다", () => {
  assert.deepEqual(normalizeAudienceGroups(["오전 세션", "오전 세션", "", " trailing ", 7]), ["오전 세션"]);
});
