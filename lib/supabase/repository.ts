import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ClassSession, Question, Slide } from "@/lib/types";
import { ensureAnonymousUser, getSessionUser, getSupabaseClient } from "./client";

/** 코스 개설·답변 같은 강사 전용 쓰기는 구글 로그인 세션을 요구한다. */
async function requireOwnerUser() {
  const user = await getSessionUser();
  if (!user || user.is_anonymous) throw new Error("강사 로그인(Google)이 필요합니다.");
  return user;
}

export async function persistSession(session: ClassSession) {
  const client = getSupabaseClient();
  if (!client || !session.courseId || !session.materialId || !session.materialVersionId) return;
  const user = await requireOwnerUser();
  const { error: courseError } = await client.from("courses").insert({ id: session.courseId, owner_id: user.id, title: session.title, visibility: "link" });
  if (courseError) throw courseError;
  const { error: lectureError } = await client.from("lectures").insert({ id: session.id, course_id: session.courseId, title: session.title, join_code: session.code, status: session.status, current_page: session.currentSlide, started_at: new Date().toISOString() });
  if (lectureError) throw lectureError;
  const type = session.fileName.toLowerCase().endsWith(".pdf") ? "pdf" : "slide_deck";
  const { error: materialError } = await client.from("materials").insert({ id: session.materialId, course_id: session.courseId, lecture_id: session.id, type, file_name: session.fileName });
  if (materialError) throw materialError;
  const { error: versionError } = await client.from("material_versions").insert({ id: session.materialVersionId, material_id: session.materialId, version_no: 1, source_path: `${user.id}/${session.id}/${session.fileName}` });
  if (versionError) throw versionError;
  const slideRows = [];
  for (const slide of session.slides) {
    // 변환 단계에서 이미 Storage 에 올라온 슬라이드는 그대로 참조한다.
    let imagePath = slide.imagePath ?? "";
    if (!imagePath && slide.imageUrl) {
      imagePath = `${user.id}/${session.id}/${slide.id}.jpg`;
      const image = await fetch(slide.imageUrl).then((response) => response.blob());
      const { error: uploadError } = await client.storage.from("lecture-slides").upload(imagePath, image, { contentType: image.type || "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;
    }
    slideRows.push({ id: slide.id, material_version_id: session.materialVersionId, page_index: slide.pageIndex, image_path: imagePath });
  }
  const { error: slidesError } = await client.from("slides").insert(slideRows);
  if (slidesError) throw slidesError;
}

export async function fetchLiveSession(joinCode: string): Promise<ClassSession | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  await ensureAnonymousUser();
  const { data: lecture, error } = await client.from("lectures").select("id, course_id, title, join_code, status, current_page, created_at").eq("join_code", joinCode.toUpperCase()).eq("status", "live").maybeSingle();
  if (error) throw error;
  if (!lecture) return null;
  const { data: material } = await client.from("materials").select("id, file_name").eq("lecture_id", lecture.id).limit(1).maybeSingle();
  if (!material) return null;
  const { data: version } = await client.from("material_versions").select("id").eq("material_id", material.id).order("version_no", { ascending: false }).limit(1).maybeSingle();
  if (!version) return null;
  const { data: rows, error: slidesError } = await client.from("slides").select("id, page_index, image_path").eq("material_version_id", version.id).order("page_index");
  if (slidesError) throw slidesError;
  const slides: Slide[] = (rows ?? []).map((slide) => ({
    id: slide.id, pageIndex: slide.page_index, title: `Slide ${slide.page_index + 1}`,
    imageUrl: client.storage.from("lecture-slides").getPublicUrl(slide.image_path).data.publicUrl
  }));
  return { id: lecture.id, code: lecture.join_code, courseId: lecture.course_id, materialId: material.id, materialVersionId: version.id, title: lecture.title, fileName: material.file_name, status: "live", currentSlide: lecture.current_page, createdAt: lecture.created_at, slides, questions: [] };
}

export async function submitQuestion(session: ClassSession, question: Question) {
  const client = getSupabaseClient();
  if (!client) return;
  const user = await ensureAnonymousUser();
  if (!user || !session.courseId) throw new Error("Supabase session is missing ownership context.");
  const slide = session.slides[question.slideIndex];
  let regionId: string | null = null;
  if (question.x !== null && question.y !== null && session.materialVersionId) {
    regionId = crypto.randomUUID();
    const { error } = await client.from("region_anchors").insert({ id: regionId, slide_id: slide.id, material_version_id: session.materialVersionId, kind: "point", coords: { x: question.x, y: question.y }, created_by: "user" });
    if (error) throw error;
  }
  const { error } = await client.from("questions").insert({ id: question.id, course_id: session.courseId, lecture_id: session.id, slide_id: slide.id, region_id: regionId, author_id: user.id, is_anonymous: true, category: question.category, raw_text: question.text, status: "unanswered", occurred_in: "live" });
  if (error) throw error;
}

export async function postAnswer(questionId: string, body: string) {
  const client = getSupabaseClient();
  if (!client) return;
  const user = await requireOwnerUser();
  const { error } = await client.from("answers").insert({ question_id: questionId, author_id: user.id, body, visibility: "participants" });
  if (error) throw error;
}

export async function markQuestionResolved(questionId: string) {
  const client = getSupabaseClient();
  if (!client) return;
  await requireOwnerUser();
  const { error } = await client.from("questions").update({ status: "resolved", updated_at: new Date().toISOString() }).eq("id", questionId);
  if (error) throw error;
}

export async function updateLecture(sessionId: string, values: { current_page?: number; status?: "draft" | "live" | "ended" }) {
  const client = getSupabaseClient();
  if (!client) return;
  await requireOwnerUser();
  const { error } = await client.from("lectures").update(values).eq("id", sessionId);
  if (error) throw error;
}

export function subscribeToLecture(sessionId: string, onRefresh: () => void): RealtimeChannel | null {
  const client = getSupabaseClient();
  if (!client) return null;
  // Realtime reuses an existing channel with the same topic. React effects can
  // reconnect before an asynchronous removeChannel() has finished, so give
  // every subscription its own topic to avoid mutating a subscribed channel.
  return client.channel(`lecture:${sessionId}:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "questions", filter: `lecture_id=eq.${sessionId}` }, onRefresh)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lectures", filter: `id=eq.${sessionId}` }, onRefresh)
    .subscribe();
}

export async function fetchLectureSnapshot(session: ClassSession): Promise<Pick<ClassSession, "currentSlide" | "status" | "questions"> | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  await ensureAnonymousUser();
  const { data: lecture } = await client.from("lectures").select("current_page, status").eq("id", session.id).maybeSingle();
  const { data, error } = await client.from("questions")
    .select("id, slide_id, category, raw_text, status, created_at, region_anchors(coords), answers(body, created_at)")
    .eq("lecture_id", session.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const questions: Question[] = (data ?? []).map((row) => {
    const anchorValue = row.region_anchors as unknown;
    const anchor = (Array.isArray(anchorValue) ? anchorValue[0] : anchorValue) as { coords?: { x?: number; y?: number } } | null;
    const answerRows = (row.answers ?? []) as Array<{ body: string; created_at: string }>;
    return {
      id: row.id,
      sessionId: session.id,
      slideIndex: Math.max(0, session.slides.findIndex((slide) => slide.id === row.slide_id)),
      x: anchor?.coords?.x ?? null,
      y: anchor?.coords?.y ?? null,
      category: row.category,
      text: row.raw_text,
      status: row.status,
      answer: answerRows[answerRows.length - 1]?.body,
      createdAt: row.created_at
    };
  });
  return { currentSlide: lecture?.current_page ?? session.currentSlide, status: (lecture?.status as ClassSession["status"]) ?? session.status, questions };
}
