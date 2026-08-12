import type { RealtimeChannel } from "@supabase/supabase-js";
import { ensureAnonymousUser, getAudienceSupabaseClient, getSessionUser, getSupabaseClient } from "@/lib/supabase/client";
import { isPdfFile, renderPdfPages } from "@/lib/pin/pdf-reference";
import { acceptsFeedbackCategory, isAudienceGroupName, isFeedbackPinMarker, isSessionFolderName, isValidFeedbackCategorySettings, normalizeAudienceGroups, normalizeFeedbackCategorySettings, normalizeFeedbackPinMarker, normalizeFeedbackPinReactionCount, type Campaign, type CampaignPage, type FeedbackCategory, type FeedbackCategorySettings, type FeedbackPin, type FeedbackPinMarker, type SessionFolder } from "@/lib/pin/types";

const BUCKET = "campaign-images";

type CampaignRow = {
  id: string;
  folder_id?: string | null;
  title: string;
  guide_text: string | null;
  join_code: string;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  status: string;
  show_presentation_qr: boolean;
  presentation_qr_position: Campaign["presentationQrPosition"];
  show_presentation_pin_status: boolean;
  presentation_pin_status_position: Campaign["presentationPinStatusPosition"];
  audience_groups: unknown;
  feedback_categories: unknown;
  created_at: string;
};

type SessionFolderRow = {
  id: string;
  name: string;
};

type PinRow = {
  id: string;
  campaign_id: string;
  author_id: string | null;
  page_index: number;
  x: number | string;
  y: number | string;
  category: FeedbackCategory;
  body: string;
  marker?: unknown;
  reaction_count?: unknown;
  reacted_by_me?: unknown;
  hidden: boolean;
  created_at: string;
};

type CampaignPageRow = {
  id: string;
  campaign_id: string;
  page_index: number;
  image_path: string;
  image_width: number;
  image_height: number;
  audience_groups: unknown;
};

type CampaignPlayerPayload = {
  campaign: CampaignRow;
  pages: CampaignPageRow[];
  pins: PinRow[];
};

const CAMPAIGN_COLUMNS = "id, folder_id, title, guide_text, join_code, image_path, image_width, image_height, status, show_presentation_qr, presentation_qr_position, show_presentation_pin_status, presentation_pin_status_position, audience_groups, feedback_categories, created_at";
const SESSION_FOLDER_COLUMNS = "id, name";
const PAGE_COLUMNS = "id, campaign_id, page_index, image_path, image_width, image_height, audience_groups";
const PIN_COLUMNS = "id, campaign_id, author_id, page_index, x, y, category, body, marker, reaction_count, hidden, created_at";

/** 캠페인 개설·숨김 처리 같은 관리자 전용 쓰기는 구글 로그인 세션을 요구한다. */
async function requireOwnerUser() {
  const user = await getSessionUser();
  if (!user || user.is_anonymous) throw new Error("관리자 로그인(Google)이 필요합니다.");
  return user;
}

/**
 * 참여자는 강사 세션을 덮어쓰지 않는 별도 Auth 저장소를 쓴다. 다만 이미 Google로
 * 로그인한 사용자는 그 세션으로도 피드백을 남길 수 있어, 먼저 기본 세션을 확인한다.
 */
async function participantContext() {
  const primary = getSupabaseClient();
  if (primary) {
    const { data } = await primary.auth.getSession();
    if (data.session?.user && !data.session.user.is_anonymous) {
      return { client: primary, user: data.session.user };
    }
  }
  const user = await ensureAnonymousUser();
  const client = getAudienceSupabaseClient();
  if (!client || !user) throw new Error("참여 세션을 만들지 못했습니다.");
  return { client, user };
}

function publicImageUrl(imagePath: string | null) {
  const client = getSupabaseClient();
  if (!client || !imagePath) return undefined;
  return client.storage.from(BUCKET).getPublicUrl(imagePath).data.publicUrl;
}

// numeric 컬럼은 supabase-js 가 문자열로 넘겨줄 수 있다. 좌표는 반드시 수로 다룬다.
const toNumber = (value: number | string) => (typeof value === "number" ? value : Number(value));

function toPin(row: PinRow): FeedbackPin {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    authorId: row.author_id,
    pageIndex: row.page_index,
    x: toNumber(row.x),
    y: toNumber(row.y),
    category: row.category,
    body: row.body,
    marker: normalizeFeedbackPinMarker(row.marker),
    reactionCount: normalizeFeedbackPinReactionCount(row.reaction_count),
    reactedByMe: row.reacted_by_me === true,
    hidden: row.hidden,
    createdAt: row.created_at
  };
}

function toPage(row: CampaignPageRow): CampaignPage {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    pageIndex: row.page_index,
    imagePath: row.image_path,
    imageUrl: publicImageUrl(row.image_path) ?? "",
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    audienceGroups: normalizeAudienceGroups(row.audience_groups),
  };
}

function legacyPage(row: CampaignRow): CampaignPage[] {
  if (!row.image_path || !row.image_width || !row.image_height) return [];
  return [{
    id: `${row.id}-legacy-page`,
    campaignId: row.id,
    pageIndex: 0,
    imagePath: row.image_path,
    imageUrl: publicImageUrl(row.image_path) ?? "",
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    audienceGroups: [],
  }];
}

function toCampaign(row: CampaignRow, pins: FeedbackPin[], pages: CampaignPage[]): Campaign {
  return {
    id: row.id,
    folderId: row.folder_id ?? null,
    code: row.join_code,
    title: row.title,
    guideText: row.guide_text ?? "",
    status: row.status === "live" ? "live" : "ended",
    showPresentationQr: row.show_presentation_qr ?? true,
    presentationQrPosition: row.presentation_qr_position ?? "bottom-right",
    showPresentationPinStatus: row.show_presentation_pin_status ?? true,
    presentationPinStatusPosition: row.presentation_pin_status_position ?? "top-right",
    audienceGroups: normalizeAudienceGroups(row.audience_groups),
    feedbackCategories: normalizeFeedbackCategorySettings(row.feedback_categories),
    pages: (pages.length ? pages : legacyPage(row)).sort((a, b) => a.pageIndex - b.pageIndex),
    createdAt: row.created_at,
    pins
  };
}

const toSessionFolder = (row: SessionFolderRow): SessionFolder => ({
  id: row.id,
  name: row.name,
});

/** 브라우저에서 이미지 원본 크기를 읽는다. 캔버스 비율을 여기에 맞춰야 좌표가 어긋나지 않는다. */
export async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function createCampaign(input: { id: string; code: string; title: string; guideText: string; referenceFile: File }): Promise<Campaign> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await requireOwnerUser();
  let pages: CampaignPage[];
  if (isPdfFile(input.referenceFile)) {
    pages = await renderPdfPages(input.id, input.referenceFile);
  } else {
    const size = await readImageSize(input.referenceFile);
    const pageId = crypto.randomUUID();
    const extension = input.referenceFile.type === "image/png" ? "png" : input.referenceFile.type === "image/webp" ? "webp" : "jpg";
    // storage 정책이 첫 폴더명을 소유자로 검증한다. 경로 모양을 바꾸면 업로드가 막힌다.
    const imagePath = `${user.id}/${input.id}/${pageId}.${extension}`;
    const { error: uploadError } = await client.storage.from(BUCKET)
      .upload(imagePath, input.referenceFile, { contentType: input.referenceFile.type || "image/jpeg", upsert: false });
    if (uploadError) throw uploadError;
    pages = [{
      id: pageId,
      campaignId: input.id,
      pageIndex: 0,
      imagePath,
      imageUrl: client.storage.from(BUCKET).getPublicUrl(imagePath).data.publicUrl,
      imageWidth: size.width,
      imageHeight: size.height,
      audienceGroups: [],
    }];
  }

  const uploadedPaths = pages.map((page) => page.imagePath);
  let campaignCreated = false;
  try {
    const first = pages[0];
    const { data, error } = await client.from("campaigns")
      .insert({
        id: input.id,
        owner_id: user.id,
        title: input.title,
        guide_text: input.guideText || null,
        join_code: input.code,
        // 구버전 클라이언트와 기존 공개 URL을 위해 첫 페이지를 legacy 컬럼에도 유지한다.
        image_path: first.imagePath,
        image_width: first.imageWidth,
        image_height: first.imageHeight,
        status: "live",
        audience_groups: []
      })
      .select(CAMPAIGN_COLUMNS)
      .single();
    if (error) throw error;
    campaignCreated = true;

    const { error: pagesError } = await client.from("campaign_pages").insert(pages.map((page) => ({
      id: page.id,
      campaign_id: input.id,
      page_index: page.pageIndex,
      image_path: page.imagePath,
      image_width: page.imageWidth,
      image_height: page.imageHeight,
      audience_groups: page.audienceGroups,
    })));
    if (pagesError) throw pagesError;
    return toCampaign(data as CampaignRow, [], pages);
  } catch (error) {
    if (campaignCreated) await client.from("campaigns").delete().eq("id", input.id);
    if (uploadedPaths.length) await client.storage.from(BUCKET).remove(uploadedPaths);
    throw error;
  }
}

/** 캠페인 행과 cascade 데이터를 먼저 지운 뒤 더는 참조되지 않는 공개 이미지를 회수한다. */
export async function deleteCampaign(campaign: Pick<Campaign, "id" | "pages">) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  await requireOwnerUser();
  const { data, error } = await client.from("campaigns").delete().eq("id", campaign.id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) {
    // DELETE 는 이미 지워진 행과 RLS 로 거부된 행을 모두 빈 결과로 돌려줄 수 있다.
    // 행이 아직 보인다면 삭제 실패이고, 보이지 않으면 목표 상태(행 없음)는 이미 충족됐다.
    const { data: remaining, error: lookupError } = await client.from("campaigns")
      .select("id")
      .eq("id", campaign.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (remaining) throw new Error("세션을 삭제할 권한이 없습니다.");
  }

  const imagePaths = [...new Set(campaign.pages.map((page) => page.imagePath).filter(Boolean))];
  if (!imagePaths.length) return;
  const { error: storageError } = await client.storage.from(BUCKET).remove(imagePaths);
  // DB 삭제는 이미 끝났다. 파일 정리 실패를 사용자에게 전체 삭제 실패로 보이면 재시도로도 복구할 수 없다.
  if (storageError) console.error("Deleted campaign storage cleanup failed", storageError);
}

/** 현재 관리자가 소유한 캠페인 전체를 핀까지 함께 복원한다. */
export async function fetchOwnedCampaigns(): Promise<Campaign[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const user = await requireOwnerUser();
  const { data, error } = await client.from("campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as CampaignRow[];
  if (!rows.length) return [];
  const campaignIds = rows.map((row) => row.id);
  const [{ data: pinData, error: pinError }, { data: pageData, error: pageError }] = await Promise.all([
    client.from("feedback_pins").select(PIN_COLUMNS).in("campaign_id", campaignIds).order("created_at", { ascending: false }),
    client.from("campaign_pages").select(PAGE_COLUMNS).in("campaign_id", campaignIds).order("page_index", { ascending: true }),
  ]);
  if (pinError) throw pinError;
  if (pageError) throw pageError;
  const pins = ((pinData ?? []) as PinRow[]).map(toPin);
  const pages = ((pageData ?? []) as CampaignPageRow[]).map(toPage);
  return rows.map((row) => toCampaign(
    row,
    pins.filter((pin) => pin.campaignId === row.id),
    pages.filter((page) => page.campaignId === row.id)
  ));
}

export async function fetchOwnedSessionFolders(): Promise<SessionFolder[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  await requireOwnerUser();
  const { data, error } = await client.from("session_folders")
    .select(SESSION_FOLDER_COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as SessionFolderRow[]).map(toSessionFolder);
}

export async function createSessionFolder(name: string): Promise<SessionFolder> {
  if (!isSessionFolderName(name)) throw new Error("폴더 이름이 올바르지 않습니다.");
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await requireOwnerUser();
  const { data, error } = await client.from("session_folders")
    .insert({ owner_id: user.id, name })
    .select(SESSION_FOLDER_COLUMNS)
    .single();
  if (error) throw error;
  return toSessionFolder(data as SessionFolderRow);
}

export async function renameSessionFolder(folderId: string, name: string): Promise<void> {
  if (!isSessionFolderName(name)) throw new Error("폴더 이름이 올바르지 않습니다.");
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  await requireOwnerUser();
  const { data, error } = await client.from("session_folders")
    .update({ name })
    .eq("id", folderId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("이름을 바꿀 폴더를 찾지 못했습니다.");
}

export async function deleteSessionFolder(folderId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  await requireOwnerUser();
  const { data, error } = await client.from("session_folders")
    .delete()
    .eq("id", folderId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("삭제할 폴더를 찾지 못했습니다.");
}

export async function moveCampaignToFolder(campaignId: string, folderId: string | null): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  await requireOwnerUser();
  const { data, error } = await client.from("campaigns")
    .update({ folder_id: folderId, updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("이동할 세션을 찾지 못했습니다.");
}

/**
 * 참여 코드로 진행 중인 캠페인을 찾는다. 참여자는 자기 핀만 돌려받는다(RLS).
 * 테이블 select 는 "내가 의견을 남긴 캠페인"만 열어 주므로, 첫 진입은 코드를 대조하는
 * definer 함수를 거친다. 코드를 모르면 남의 캠페인을 열거할 수 없다.
 */
export async function fetchLiveCampaign(code: string, audienceGroup: string | null): Promise<Campaign | null> {
  const { client } = await participantContext();
  const { data, error } = await client.rpc("find_live_campaign", { target_code: code });
  if (error) throw error;
  const row = (data as CampaignRow[] | null)?.[0];
  if (!row) return null;
  const [{ data: pinData, error: pinError }, { data: pageData, error: pageError }] = await Promise.all([
    client.from("feedback_pins").select(PIN_COLUMNS).eq("campaign_id", row.id).order("created_at", { ascending: false }),
    client.rpc("find_campaign_pages", { target_code: code, target_audience_group: audienceGroup }),
  ]);
  if (pinError) throw pinError;
  if (pageError) throw pageError;
  return toCampaign(row, ((pinData ?? []) as PinRow[]).map(toPin), ((pageData ?? []) as CampaignPageRow[]).map(toPage));
}

/** 작성자 식별자·숨긴 핀을 제외한다. 참여자 화면은 공감 쓰기와 같은 세션으로 조회한다. */
export async function fetchCampaignPlayer(campaignId: string, asParticipant = false): Promise<Campaign | null> {
  const client = asParticipant ? (await participantContext()).client : getAudienceSupabaseClient();
  if (!client) return null;
  if (!asParticipant) await ensureAnonymousUser();
  const { data, error } = await client.rpc("find_campaign_player", { target_campaign_id: campaignId });
  if (error) throw error;
  const payload = data as CampaignPlayerPayload | null;
  if (!payload?.campaign) return null;
  return toCampaign(payload.campaign, payload.pins.map(toPin), payload.pages.map(toPage));
}

/** 실제로 기록된 작성자 id 를 돌려준다. 참여자 화면이 "내 피드백"을 가리는 기준이 된다. */
export async function submitPin(campaign: Campaign, pin: FeedbackPin): Promise<string | null> {
  if (!acceptsFeedbackCategory(campaign.feedbackCategories, pin.category)) throw new Error("현재 선택할 수 없는 피드백 유형입니다.");
  if (!isFeedbackPinMarker(pin.marker)) throw new Error("선택할 수 없는 PIN 모양입니다.");
  const { client, user } = await participantContext();
  const { error } = await client.from("feedback_pins").insert({
    id: pin.id,
    campaign_id: campaign.id,
    author_id: user.id,
    is_anonymous: true,
    page_index: pin.pageIndex,
    x: pin.x,
    y: pin.y,
    category: pin.category,
    body: pin.body,
    marker: pin.marker,
    hidden: false
  });
  if (error) throw error;
  return user.id;
}

export async function updatePin(campaign: Campaign, pinId: string, values: { category: FeedbackCategory; body: string; marker: FeedbackPinMarker }) {
  if (!acceptsFeedbackCategory(campaign.feedbackCategories, values.category)) throw new Error("현재 선택할 수 없는 피드백 유형입니다.");
  if (!isFeedbackPinMarker(values.marker)) throw new Error("선택할 수 없는 PIN 모양입니다.");
  const { client } = await participantContext();
  const { data, error } = await client.from("feedback_pins")
    .update({ category: values.category, body: values.body, marker: values.marker, updated_at: new Date().toISOString() })
    .eq("id", pinId)
    .eq("hidden", false)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("고칠 수 있는 피드백을 찾지 못했습니다.");
}

/** 반응 행은 공개하지 않고 desired-state RPC로만 한 사람당 한 공감을 설정한다. */
export async function setPinReaction(pinId: string, reacted: boolean): Promise<boolean> {
  if (typeof reacted !== "boolean") throw new Error("공감 상태가 올바르지 않습니다.");
  const { client } = await participantContext();
  const { data, error } = await client.rpc("set_feedback_pin_reaction", {
    target_pin_id: pinId,
    target_reacted: reacted,
  });
  if (error) throw error;
  if (typeof data !== "boolean") throw new Error("공감 상태를 확인하지 못했습니다.");
  return data;
}

/** 제외·되돌리기는 관리자만 통과한다(RLS). 삭제가 아니라 표시 여부만 바꾼다. */
export async function setPinHidden(pinId: string, hidden: boolean) {
  const client = getSupabaseClient();
  if (!client) return;
  await requireOwnerUser();
  const { error } = await client.from("feedback_pins")
    .update({ hidden, updated_at: new Date().toISOString() })
    .eq("id", pinId);
  if (error) throw error;
}

export async function updateCampaign(campaignId: string, values: { status?: "live" | "ended"; title?: string; guide_text?: string; show_presentation_qr?: boolean; presentation_qr_position?: Campaign["presentationQrPosition"]; show_presentation_pin_status?: boolean; presentation_pin_status_position?: Campaign["presentationPinStatusPosition"]; feedback_categories?: FeedbackCategorySettings }) {
  if (values.feedback_categories && !isValidFeedbackCategorySettings(values.feedback_categories)) {
    throw new Error("피드백 유형 설정이 올바르지 않습니다.");
  }
  const client = getSupabaseClient();
  if (!client) return;
  await requireOwnerUser();
  const { data, error } = await client.from("campaigns")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("설정을 바꿀 세션을 찾지 못했습니다.");
}

export async function updateCampaignPageAudienceGroups(pageId: string, audienceGroups: string[]) {
  if (new Set(audienceGroups.map((group) => group.toLocaleLowerCase())).size !== audienceGroups.length || !audienceGroups.every(isAudienceGroupName)) {
    throw new Error("참여 유형이 올바르지 않습니다.");
  }
  const client = getSupabaseClient();
  if (!client) return;
  await requireOwnerUser();
  const { data, error } = await client.from("campaign_pages")
    .update({ audience_groups: audienceGroups })
    .eq("id", pageId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("공개 범위를 바꿀 페이지를 찾지 못했습니다.");
}

export async function updateCampaignAudienceGroups(campaignId: string, audienceGroups: string[]) {
  if (audienceGroups.length > 20
    || new Set(audienceGroups.map((group) => group.toLocaleLowerCase())).size !== audienceGroups.length
    || !audienceGroups.every(isAudienceGroupName)) {
    throw new Error("참여자 그룹이 올바르지 않습니다.");
  }
  const client = getSupabaseClient();
  if (!client) return;
  await requireOwnerUser();
  const { error } = await client.rpc("set_campaign_audience_groups", {
    target_campaign_id: campaignId,
    target_audience_groups: audienceGroups,
  });
  if (error) throw error;
}

export function subscribeToCampaign(campaignId: string, onRefresh: () => void, asAudience = false): RealtimeChannel | null {
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return null;
  // Realtime 은 같은 토픽의 채널을 재사용한다. 이펙트가 removeChannel 완료 전에 다시 붙을 수
  // 있으므로 구독마다 고유 토픽을 준다.
  return client.channel(`campaign:${campaignId}:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "feedback_pins", filter: `campaign_id=eq.${campaignId}` }, onRefresh)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "campaigns", filter: `id=eq.${campaignId}` }, onRefresh)
    .subscribe();
}

/** 코드 기반 조회를 보조해, 캠페인 행을 아직 직접 볼 수 없는 참여자도 종료를 감지한다. */
export async function fetchCampaignStatus(
  campaign: Pick<Campaign, "id" | "code" | "status">,
  asAudience = false
): Promise<Campaign["status"]> {
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return campaign.status;
  if (asAudience) await ensureAnonymousUser();
  const { data: row, error } = await client.from("campaigns").select("status").eq("id", campaign.id).maybeSingle();
  if (error) throw error;
  if (row?.status) return row.status as Campaign["status"];
  if (!asAudience) return campaign.status;

  const { data: lookup, error: lookupError } = await client.rpc("find_live_campaign", { target_code: campaign.code });
  if (lookupError) throw lookupError;
  const matched = (lookup as CampaignRow[] | null)?.[0];
  return matched?.status === "live" ? "live" : "ended";
}

export async function fetchCampaignSnapshot(campaign: Campaign, asAudience = false): Promise<Pick<Campaign, "status" | "showPresentationQr" | "presentationQrPosition" | "showPresentationPinStatus" | "presentationPinStatusPosition" | "feedbackCategories" | "pins"> | null> {
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return null;
  if (asAudience) await ensureAnonymousUser();
  const [{ data: directRow, error: campaignError }, { data, error: pinsError }] = await Promise.all([
    client.from("campaigns").select("status, show_presentation_qr, presentation_qr_position, show_presentation_pin_status, presentation_pin_status_position, feedback_categories").eq("id", campaign.id).maybeSingle(),
    client.from("feedback_pins").select(PIN_COLUMNS).eq("campaign_id", campaign.id).order("created_at", { ascending: false }),
  ]);
  if (campaignError) throw campaignError;
  if (pinsError) throw pinsError;
  let row = directRow;
  // 첫 핀을 남기기 전 참여자는 campaigns SELECT 정책을 통과하지 못하므로 코드 RPC로 최신 설정을 받는다.
  if (!row && asAudience) {
    const { data: lookup, error: lookupError } = await client.rpc("find_live_campaign", { target_code: campaign.code });
    if (lookupError) throw lookupError;
    row = ((lookup as CampaignRow[] | null)?.[0] ?? null);
  }
  const status = row?.status ? row.status as Campaign["status"] : await fetchCampaignStatus(campaign, asAudience);
  return {
    status,
    showPresentationQr: row?.show_presentation_qr ?? campaign.showPresentationQr,
    presentationQrPosition: row?.presentation_qr_position ?? campaign.presentationQrPosition,
    showPresentationPinStatus: row?.show_presentation_pin_status ?? campaign.showPresentationPinStatus,
    presentationPinStatusPosition: row?.presentation_pin_status_position ?? campaign.presentationPinStatusPosition,
    feedbackCategories: normalizeFeedbackCategorySettings(row?.feedback_categories ?? campaign.feedbackCategories),
    pins: ((data ?? []) as PinRow[]).map(toPin)
  };
}
