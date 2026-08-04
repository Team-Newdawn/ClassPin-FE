import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ClassSession, NormalizedPoint, Question, Slide } from "@/lib/types";
import { ensureAnonymousUser, getAudienceSupabaseClient, getSessionUser, getSupabaseClient } from "./client";

type LectureRow = {
  id: string;
  course_id: string;
  title: string;
  join_code: string;
  status: ClassSession["status"];
  current_page: number;
  show_question_pins: boolean;
  presentation_qr_position: ClassSession["presentationQrPosition"];
  created_at: string;
};

type MaterialRow = {
  id: string;
  lecture_id: string;
  file_name: string;
};

type MaterialVersionRow = {
  id: string;
  material_id: string;
  version_no: number;
};

type SlideRow = {
  id: string;
  material_version_id: string;
  page_index: number;
  image_path: string;
};

type QuestionRow = {
  id: string;
  lecture_id: string;
  slide_id: string | null;
  category: Question["category"];
  raw_text: string;
  status: Question["status"];
  created_at: string;
  region_anchors: {
    kind?: Question["anchorKind"];
    coords?: { x?: number; y?: number; width?: number; height?: number; points?: unknown };
  } | Array<{
    kind?: Question["anchorKind"];
    coords?: { x?: number; y?: number; width?: number; height?: number; points?: unknown };
  }> | null;
  answers: Array<{ body: string; created_at: string }> | null;
};

function toNormalizedPath(value: unknown): NormalizedPoint[] | null {
  if (!Array.isArray(value)) return null;
  const points = value.flatMap((point) => {
    if (!Array.isArray(point) || point.length !== 2) return [];
    const [x, y] = point;
    return typeof x === "number" && typeof y === "number" && x >= 0 && x <= 1 && y >= 0 && y <= 1
      ? [{ x, y }]
      : [];
  });
  return points.length >= 2 ? points : null;
}

/** 코스 개설·답변 같은 강사 전용 쓰기는 구글 로그인 세션을 요구한다. */
async function requireOwnerUser() {
  const user = await getSessionUser();
  if (!user || user.is_anonymous) throw new Error("강사 로그인(Google)이 필요합니다.");
  return user;
}

function toQuestion(row: QuestionRow, sessionId: string, slides: Slide[]): Question {
  const anchorValue = row.region_anchors;
  const anchor = Array.isArray(anchorValue) ? anchorValue[0] : anchorValue;
  const path = toNormalizedPath(anchor?.coords?.points);
  const answerRows = [...(row.answers ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return {
    id: row.id,
    sessionId,
    slideIndex: Math.max(0, slides.findIndex((slide) => slide.id === row.slide_id)),
    x: anchor?.coords?.x ?? path?.[0]?.x ?? null,
    y: anchor?.coords?.y ?? path?.[0]?.y ?? null,
    anchorKind: anchor?.kind === "path" && path ? "path" : anchor?.kind === "box" ? "box" : "point",
    width: anchor?.coords?.width ?? null,
    height: anchor?.coords?.height ?? null,
    path,
    category: row.category,
    text: row.raw_text,
    status: row.status,
    answer: answerRows[answerRows.length - 1]?.body,
    createdAt: row.created_at
  };
}

export async function persistSession(session: ClassSession) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  if (!session.courseId || !session.materialId || !session.materialVersionId) throw new Error("강의 저장 정보가 완전하지 않습니다.");
  const user = await requireOwnerUser();
  const { error: courseError } = await client.from("courses").insert({ id: session.courseId, owner_id: user.id, title: session.title, visibility: "link" });
  if (courseError) throw courseError;
  const { error: lectureError } = await client.from("lectures").insert({
    id: session.id,
    course_id: session.courseId,
    title: session.title,
    join_code: session.code,
    status: session.status,
    current_page: session.currentSlide,
    show_question_pins: session.showQuestionPins,
    presentation_qr_position: session.presentationQrPosition,
    started_at: new Date().toISOString()
  });
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

/** 현재 Google 강사가 소유한 강의 전체를 DB에서 복원한다. */
export async function fetchOwnedSessions(): Promise<ClassSession[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const user = await requireOwnerUser();

  const { data: courseRows, error: courseError } = await client.from("courses")
    .select("id")
    .eq("owner_id", user.id);
  if (courseError) throw courseError;
  const courseIds = (courseRows ?? []).map((course) => course.id);
  if (!courseIds.length) return [];

  const { data: lectureData, error: lectureError } = await client.from("lectures")
    .select("id, course_id, title, join_code, status, current_page, show_question_pins, presentation_qr_position, created_at")
    .in("course_id", courseIds)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (lectureError) throw lectureError;
  const lectures = (lectureData ?? []) as LectureRow[];
  if (!lectures.length) return [];
  const lectureIds = lectures.map((lecture) => lecture.id);

  const { data: materialData, error: materialError } = await client.from("materials")
    .select("id, lecture_id, file_name")
    .in("lecture_id", lectureIds)
    .order("created_at", { ascending: true });
  if (materialError) throw materialError;
  const materials = (materialData ?? []) as MaterialRow[];
  const materialByLecture = new Map<string, MaterialRow>();
  materials.forEach((material) => {
    if (!materialByLecture.has(material.lecture_id)) materialByLecture.set(material.lecture_id, material);
  });

  const materialIds = materials.map((material) => material.id);
  const versions: MaterialVersionRow[] = [];
  if (materialIds.length) {
    const { data, error } = await client.from("material_versions")
      .select("id, material_id, version_no")
      .in("material_id", materialIds)
      .order("version_no", { ascending: false });
    if (error) throw error;
    versions.push(...((data ?? []) as MaterialVersionRow[]));
  }
  const versionByMaterial = new Map<string, MaterialVersionRow>();
  versions.forEach((version) => {
    if (!versionByMaterial.has(version.material_id)) versionByMaterial.set(version.material_id, version);
  });

  const versionIds = versions.map((version) => version.id);
  const slideRows: SlideRow[] = [];
  if (versionIds.length) {
    const { data, error } = await client.from("slides")
      .select("id, material_version_id, page_index, image_path")
      .in("material_version_id", versionIds)
      .order("page_index", { ascending: true });
    if (error) throw error;
    slideRows.push(...((data ?? []) as SlideRow[]));
  }
  const slidesByVersion = new Map<string, Slide[]>();
  slideRows.forEach((slide) => {
    const rows = slidesByVersion.get(slide.material_version_id) ?? [];
    rows.push({
      id: slide.id,
      pageIndex: slide.page_index,
      title: `Slide ${slide.page_index + 1}`,
      imagePath: slide.image_path,
      imageUrl: client.storage.from("lecture-slides").getPublicUrl(slide.image_path).data.publicUrl
    });
    slidesByVersion.set(slide.material_version_id, rows);
  });

  const { data: questionData, error: questionError } = await client.from("questions")
    .select("id, lecture_id, slide_id, category, raw_text, status, created_at, region_anchors(kind, coords), answers(body, created_at)")
    .in("lecture_id", lectureIds)
    .order("created_at", { ascending: false });
  if (questionError) throw questionError;
  const questionRows = (questionData ?? []) as unknown as QuestionRow[];
  const questionsByLecture = new Map<string, QuestionRow[]>();
  questionRows.forEach((question) => {
    const rows = questionsByLecture.get(question.lecture_id) ?? [];
    rows.push(question);
    questionsByLecture.set(question.lecture_id, rows);
  });

  return lectures.flatMap((lecture) => {
    const material = materialByLecture.get(lecture.id);
    if (!material) return [];
    const version = versionByMaterial.get(material.id);
    if (!version) return [];
    const slides = slidesByVersion.get(version.id) ?? [];
    return [{
      id: lecture.id,
      code: lecture.join_code,
      courseId: lecture.course_id,
      materialId: material.id,
      materialVersionId: version.id,
      title: lecture.title,
      fileName: material.file_name,
      status: lecture.status,
      currentSlide: lecture.current_page,
      showQuestionPins: lecture.show_question_pins,
      presentationQrPosition: lecture.presentation_qr_position,
      createdAt: lecture.created_at,
      slides,
      questions: (questionsByLecture.get(lecture.id) ?? []).map((question) => toQuestion(question, lecture.id, slides))
    }];
  });
}

export async function fetchLiveSession(joinCode: string): Promise<ClassSession | null> {
  const client = getAudienceSupabaseClient();
  if (!client) return null;
  await ensureAnonymousUser();
  const { data: lecture, error } = await client.from("lectures")
    .select("id, course_id, title, join_code, status, current_page, show_question_pins, presentation_qr_position, created_at")
    .eq("join_code", joinCode.toUpperCase())
    .eq("status", "live")
    .maybeSingle();
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
    imagePath: slide.image_path,
    imageUrl: client.storage.from("lecture-slides").getPublicUrl(slide.image_path).data.publicUrl
  }));
  const session: ClassSession = {
    id: lecture.id,
    code: lecture.join_code,
    courseId: lecture.course_id,
    materialId: material.id,
    materialVersionId: version.id,
    title: lecture.title,
    fileName: material.file_name,
    status: "live",
    currentSlide: lecture.current_page,
    showQuestionPins: lecture.show_question_pins,
    presentationQrPosition: lecture.presentation_qr_position,
    createdAt: lecture.created_at,
    slides,
    questions: []
  };
  const snapshot = await fetchLectureSnapshot(session, true);
  return snapshot ? { ...session, ...snapshot } : session;
}

export async function submitQuestion(session: ClassSession, question: Question) {
  const client = getAudienceSupabaseClient();
  if (!client) return;
  const user = await ensureAnonymousUser();
  if (!user || !session.courseId) throw new Error("Supabase session is missing ownership context.");
  const slide = session.slides[question.slideIndex];
  if (!slide) throw new Error("질문을 남길 슬라이드를 찾지 못했습니다.");
  let regionId: string | null = null;
  if (question.x !== null && question.y !== null && session.materialVersionId) {
    regionId = crypto.randomUUID();
    const path = (question.path ?? []).slice(0, 512);
    const isPath = question.anchorKind === "path" && path.length >= 2;
    const isBox = question.anchorKind === "box" && question.width != null && question.height != null;
    const { error } = await client.from("region_anchors").insert({
      id: regionId,
      slide_id: slide.id,
      material_version_id: session.materialVersionId,
      kind: isPath ? "path" : isBox ? "box" : "point",
      coords: isPath
        ? { x: path[0].x, y: path[0].y, points: path.map((point) => [point.x, point.y]) }
        : isBox
          ? { x: question.x, y: question.y, width: question.width, height: question.height }
          : { x: question.x, y: question.y },
      created_by: "user"
    });
    if (error) throw error;
  }
  const { error } = await client.from("questions").insert({ id: question.id, course_id: session.courseId, lecture_id: session.id, slide_id: slide.id, region_id: regionId, author_id: user.id, is_anonymous: true, category: question.category, raw_text: question.text, status: "unanswered", occurred_in: "live" });
  if (error) throw error;
}

export async function updateQuestion(questionId: string, values: Pick<Question, "category" | "text">) {
  const client = getAudienceSupabaseClient();
  if (!client) return;
  await ensureAnonymousUser();
  const { data, error } = await client.from("questions")
    .update({ category: values.category, raw_text: values.text, updated_at: new Date().toISOString() })
    .eq("id", questionId)
    .eq("status", "unanswered")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("수정할 수 있는 질문을 찾지 못했습니다.");
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

export async function updateLecture(sessionId: string, values: {
  current_page?: number;
  status?: "live" | "ended";
  show_question_pins?: boolean;
  presentation_qr_position?: ClassSession["presentationQrPosition"];
}) {
  const client = getSupabaseClient();
  if (!client) return;
  await requireOwnerUser();
  const { error } = await client.from("lectures").update(values).eq("id", sessionId);
  if (error) throw error;
}

export function subscribeToLecture(sessionId: string, onRefresh: () => void, asAudience = false): RealtimeChannel | null {
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return null;
  // Realtime reuses an existing channel with the same topic. React effects can
  // reconnect before an asynchronous removeChannel() has finished, so give
  // every subscription its own topic to avoid mutating a subscribed channel.
  return client.channel(`lecture:${sessionId}:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "questions", filter: `lecture_id=eq.${sessionId}` }, onRefresh)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lectures", filter: `id=eq.${sessionId}` }, onRefresh)
    .subscribe();
}

export async function fetchLectureSnapshot(session: ClassSession, asAudience = false): Promise<Pick<ClassSession, "currentSlide" | "status" | "showQuestionPins" | "presentationQrPosition" | "questions"> | null> {
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return null;
  if (asAudience) await ensureAnonymousUser();
  const { data: lecture } = await client.from("lectures")
    .select("current_page, status, show_question_pins, presentation_qr_position")
    .eq("id", session.id)
    .maybeSingle();
  const { data, error } = await client.from("questions")
    .select("id, slide_id, category, raw_text, status, created_at, region_anchors(kind, coords), answers(body, created_at)")
    .eq("lecture_id", session.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const questions = ((data ?? []) as unknown as QuestionRow[])
    .map((row) => toQuestion({ ...row, lecture_id: session.id }, session.id, session.slides));
  return {
    currentSlide: lecture?.current_page ?? session.currentSlide,
    status: (lecture?.status as ClassSession["status"]) ?? session.status,
    showQuestionPins: lecture?.show_question_pins ?? session.showQuestionPins,
    presentationQrPosition: (lecture?.presentation_qr_position as ClassSession["presentationQrPosition"]) ?? session.presentationQrPosition,
    questions
  };
}
