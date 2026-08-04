import type { RealtimeChannel } from "@supabase/supabase-js";
import { ensureAnonymousUser, getAudienceSupabaseClient, getSessionUser, getSupabaseClient } from "@/lib/supabase/client";
import type { Campaign, FeedbackCategory, FeedbackPin } from "@/lib/pin/types";

const BUCKET = "campaign-images";

type CampaignRow = {
  id: string;
  title: string;
  guide_text: string | null;
  join_code: string;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  status: string;
  created_at: string;
};

type PinRow = {
  id: string;
  campaign_id: string;
  author_id: string | null;
  x: number | string;
  y: number | string;
  category: FeedbackCategory;
  body: string;
  hidden: boolean;
  created_at: string;
};

const CAMPAIGN_COLUMNS = "id, title, guide_text, join_code, image_path, image_width, image_height, status, created_at";
const PIN_COLUMNS = "id, campaign_id, author_id, x, y, category, body, hidden, created_at";

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
    x: toNumber(row.x),
    y: toNumber(row.y),
    category: row.category,
    body: row.body,
    hidden: row.hidden,
    createdAt: row.created_at
  };
}

function toCampaign(row: CampaignRow, pins: FeedbackPin[]): Campaign {
  return {
    id: row.id,
    code: row.join_code,
    title: row.title,
    guideText: row.guide_text ?? "",
    status: row.status === "live" ? "live" : "ended",
    imageUrl: publicImageUrl(row.image_path),
    imagePath: row.image_path ?? undefined,
    imageWidth: row.image_width ?? undefined,
    imageHeight: row.image_height ?? undefined,
    createdAt: row.created_at,
    pins
  };
}

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

export async function createCampaign(input: { id: string; code: string; title: string; guideText: string; imageFile: File }): Promise<Campaign> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await requireOwnerUser();
  const size = await readImageSize(input.imageFile);
  const extension = input.imageFile.type === "image/png" ? "png" : input.imageFile.type === "image/webp" ? "webp" : "jpg";
  // storage 정책이 첫 폴더명을 소유자로 검증한다. 경로 모양을 바꾸면 업로드가 막힌다.
  const imagePath = `${user.id}/${input.id}.${extension}`;
  const { error: uploadError } = await client.storage.from(BUCKET)
    .upload(imagePath, input.imageFile, { contentType: input.imageFile.type || "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await client.from("campaigns")
    .insert({
      id: input.id,
      owner_id: user.id,
      title: input.title,
      guide_text: input.guideText || null,
      join_code: input.code,
      image_path: imagePath,
      image_width: size.width,
      image_height: size.height,
      status: "live"
    })
    .select(CAMPAIGN_COLUMNS)
    .single();
  if (error) {
    // 이미지가 먼저 올라가므로 여기서 멈추면 아무도 참조하지 않는 객체가 남는다.
    await client.storage.from(BUCKET).remove([imagePath]).catch(() => {});
    throw error;
  }
  return toCampaign(data as CampaignRow, []);
}

/** 현재 관리자가 소유한 캠페인 전체를 핀까지 함께 복원한다. */
export async function fetchOwnedCampaigns(): Promise<Campaign[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  await requireOwnerUser();
  const { data, error } = await client.from("campaigns")
    .select(CAMPAIGN_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as CampaignRow[];
  if (!rows.length) return [];
  const { data: pinData, error: pinError } = await client.from("feedback_pins")
    .select(PIN_COLUMNS)
    .in("campaign_id", rows.map((row) => row.id))
    .order("created_at", { ascending: false });
  if (pinError) throw pinError;
  const pins = ((pinData ?? []) as PinRow[]).map(toPin);
  return rows.map((row) => toCampaign(row, pins.filter((pin) => pin.campaignId === row.id)));
}

/**
 * 참여 코드로 진행 중인 캠페인을 찾는다. 참여자는 자기 핀만 돌려받는다(RLS).
 * 테이블 select 는 "내가 의견을 남긴 캠페인"만 열어 주므로, 첫 진입은 코드를 대조하는
 * definer 함수를 거친다. 코드를 모르면 남의 캠페인을 열거할 수 없다.
 */
export async function fetchLiveCampaign(code: string): Promise<Campaign | null> {
  const { client } = await participantContext();
  const { data, error } = await client.rpc("find_live_campaign", { target_code: code });
  if (error) throw error;
  const row = (data as CampaignRow[] | null)?.[0];
  if (!row) return null;
  const { data: pinData, error: pinError } = await client.from("feedback_pins")
    .select(PIN_COLUMNS)
    .eq("campaign_id", row.id)
    .order("created_at", { ascending: false });
  if (pinError) throw pinError;
  return toCampaign(row, ((pinData ?? []) as PinRow[]).map(toPin));
}

/** 실제로 기록된 작성자 id 를 돌려준다. 참여자 화면이 "내 피드백"을 가리는 기준이 된다. */
export async function submitPin(campaign: Campaign, pin: FeedbackPin): Promise<string | null> {
  const { client, user } = await participantContext();
  const { error } = await client.from("feedback_pins").insert({
    id: pin.id,
    campaign_id: campaign.id,
    author_id: user.id,
    is_anonymous: true,
    x: pin.x,
    y: pin.y,
    category: pin.category,
    body: pin.body,
    hidden: false
  });
  if (error) throw error;
  return user.id;
}

export async function updatePin(pinId: string, values: { category: FeedbackCategory; body: string }) {
  const { client } = await participantContext();
  const { data, error } = await client.from("feedback_pins")
    .update({ category: values.category, body: values.body, updated_at: new Date().toISOString() })
    .eq("id", pinId)
    .eq("hidden", false)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("고칠 수 있는 피드백을 찾지 못했습니다.");
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

export async function updateCampaign(campaignId: string, values: { status?: "live" | "ended"; title?: string; guide_text?: string }) {
  const client = getSupabaseClient();
  if (!client) return;
  await requireOwnerUser();
  const { error } = await client.from("campaigns")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", campaignId);
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

export async function fetchCampaignSnapshot(campaign: Campaign, asAudience = false): Promise<Pick<Campaign, "status" | "pins"> | null> {
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return null;
  if (asAudience) await ensureAnonymousUser();
  const { data: row, error: statusError } = await client.from("campaigns").select("status").eq("id", campaign.id).maybeSingle();
  if (statusError) throw statusError;
  // 아직 의견을 남기지 않은 참여자에게는 캠페인 행이 보이지 않는다. 그때 예전 상태를 그대로
  // 두면 종료된 캠페인이 화면에는 계속 LIVE 로 남아, 제출이 조용히 거부되는데도 재시도만 한다.
  // 행이 안 보이면 코드로 다시 물어 살아 있는지 확인한다.
  let status = row?.status as Campaign["status"] | undefined;
  if (!status) {
    const { data: lookup } = await client.rpc("find_live_campaign", { target_code: campaign.code });
    const matched = (lookup as CampaignRow[] | null)?.[0];
    status = matched?.status === "live" ? "live" : "ended";
  }
  const { data, error } = await client.from("feedback_pins")
    .select(PIN_COLUMNS)
    .eq("campaign_id", campaign.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return { status, pins: ((data ?? []) as PinRow[]).map(toPin) };
}
