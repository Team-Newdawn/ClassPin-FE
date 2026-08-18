import type { RealtimeChannel } from "@supabase/supabase-js";
import { normalizeClassFolderName, type ClassFolder, type ClassSession, type NormalizedPoint, type Question, type Slide } from "@/lib/types";
import { ensureAnonymousUser, getAudienceSupabaseClient, getSessionUser, getSupabaseClient } from "./client";

export type PlatformExperienceSource = "lecture" | "feedback";

type LectureRow = {
  id: string;
  course_id: string;
  title: string;
  join_code: string;
  status: ClassSession["status"];
  current_page: number;
  show_question_pins: boolean;
  show_presentation_qr: boolean;
  presentation_qr_position: ClassSession["presentationQrPosition"];
  created_at: string;
};

type CourseRow = {
  id: string;
  folder_id: string | null;
};

type ClassFolderRow = {
  id: string;
  name: string;
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

type SlideInstructorNoteRow = {
  slide_id: string;
  body: string;
};

type DeletedSlideRow = {
  deleted_image_path: string;
  deleted_page_index: number;
  deleted_question_count: number;
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
  const { error: courseError } = await client.from("courses").insert({ id: session.courseId, owner_id: user.id, folder_id: session.folderId, title: session.title, visibility: "link" });
  if (courseError) throw courseError;
  const { error: lectureError } = await client.from("lectures").insert({
    id: session.id,
    course_id: session.courseId,
    title: session.title,
    join_code: session.code,
    status: session.status,
    current_page: session.currentSlide,
    show_question_pins: session.showQuestionPins,
    show_presentation_qr: session.showPresentationQr,
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

export async function fetchOwnedClassFolders(): Promise<ClassFolder[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const user = await requireOwnerUser();
  const { data, error } = await client.from("session_folders")
    .select("id, name, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ClassFolderRow[]).map((folder) => ({
    id: folder.id,
    name: folder.name,
    createdAt: folder.created_at
  }));
}

export async function createClassFolder(name: string): Promise<ClassFolder> {
  const normalizedName = normalizeClassFolderName(name);
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await requireOwnerUser();
  const { data, error } = await client.from("session_folders")
    .insert({ owner_id: user.id, name: normalizedName })
    .select("id, name, created_at")
    .single();
  if (error) throw error;
  const folder = data as ClassFolderRow;
  return { id: folder.id, name: folder.name, createdAt: folder.created_at };
}

export async function moveSessionToFolder(courseId: string, folderId: string | null): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await requireOwnerUser();
  const { data, error } = await client.from("courses")
    .update({ folder_id: folderId })
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("이동할 강의 자료를 찾지 못했습니다.");
}

const APPENDABLE_SLIDE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SLIDE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_SLIDES_PER_APPEND = 20;

/** 기존 자료 버전의 끝에 이미지 슬라이드를 원자적으로 추가한다. */
export async function appendSessionSlides(session: ClassSession, files: File[]): Promise<Slide[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  if (!session.materialVersionId) throw new Error("슬라이드를 추가할 자료 버전을 찾지 못했습니다.");
  if (files.length < 1 || files.length > MAX_SLIDES_PER_APPEND) throw new Error("슬라이드는 한 번에 1~20장까지 추가할 수 있습니다.");
  const invalidFile = files.find((file) => !APPENDABLE_SLIDE_TYPES.has(file.type) || file.size > MAX_SLIDE_IMAGE_BYTES);
  if (invalidFile) throw new Error("10MB 이하의 PNG, JPG, WebP 이미지만 추가할 수 있습니다.");

  const user = await requireOwnerUser();
  const uploadedPaths: string[] = [];
  try {
    const newSlides = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const imagePath = `${user.id}/${session.id}/appended/${id}.${extension}`;
      const { error: uploadError } = await client.storage.from("lecture-slides").upload(imagePath, file, {
        contentType: file.type,
        upsert: false
      });
      if (uploadError) throw uploadError;
      uploadedPaths.push(imagePath);
      newSlides.push({ id, image_path: imagePath });
    }

    const { data, error } = await client.rpc("append_lecture_slides", {
      target_material_version_id: session.materialVersionId,
      new_slides: newSlides
    });
    if (error) throw error;
    return ((data ?? []) as SlideRow[])
      .sort((a, b) => a.page_index - b.page_index)
      .map((slide) => ({
        id: slide.id,
        pageIndex: slide.page_index,
        title: `Slide ${slide.page_index + 1}`,
        imagePath: slide.image_path,
        imageUrl: client.storage.from("lecture-slides").getPublicUrl(slide.image_path).data.publicUrl,
        speakerNote: ""
      }));
  } catch (error) {
    if (uploadedPaths.length) await client.storage.from("lecture-slides").remove(uploadedPaths);
    throw error;
  }
}

/** 슬라이드와 연결 데이터를 DB에서 삭제한 뒤 공개 Storage 객체를 회수한다. */
export async function deleteSessionSlide(slideId: string): Promise<DeletedSlideRow> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  await requireOwnerUser();
  const { data, error } = await client.rpc("delete_lecture_slide", { target_slide_id: slideId });
  if (error) throw error;
  const deleted = ((data ?? []) as DeletedSlideRow[])[0];
  if (!deleted) throw new Error("삭제된 슬라이드 정보를 받지 못했습니다.");
  const { error: storageError } = await client.storage.from("lecture-slides").remove([deleted.deleted_image_path]);
  if (storageError) console.error("Deleted slide storage cleanup failed", storageError);
  return deleted;
}

/** Realtime INSERT 뒤 현재 자료 버전의 전체 슬라이드를 다시 읽는다. */
export async function fetchSessionSlides(session: ClassSession, asAudience = false): Promise<Slide[]> {
  if (!session.materialVersionId) return session.slides;
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return session.slides;
  if (asAudience) await ensureAnonymousUser();

  const { data, error } = await client.from("slides")
    .select("id, material_version_id, page_index, image_path")
    .eq("material_version_id", session.materialVersionId)
    .order("page_index", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as SlideRow[];
  const noteBySlide = new Map<string, string>();
  if (!asAudience && rows.length) {
    await requireOwnerUser();
    const { data: noteData, error: noteError } = await client.from("slide_instructor_notes")
      .select("slide_id, body")
      .in("slide_id", rows.map((slide) => slide.id));
    if (noteError) throw noteError;
    ((noteData ?? []) as SlideInstructorNoteRow[]).forEach((note) => noteBySlide.set(note.slide_id, note.body));
  }
  return rows.map((slide) => ({
    id: slide.id,
    pageIndex: slide.page_index,
    title: `Slide ${slide.page_index + 1}`,
    imagePath: slide.image_path,
    imageUrl: client.storage.from("lecture-slides").getPublicUrl(slide.image_path).data.publicUrl,
    ...(asAudience ? {} : { speakerNote: noteBySlide.get(slide.id) ?? "" })
  }));
}

/** 현재 Google 강사가 소유한 강의 전체를 DB에서 복원한다. */
export async function fetchOwnedSessions(): Promise<ClassSession[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const user = await requireOwnerUser();

  const { data: courseRows, error: courseError } = await client.from("courses")
    .select("id, folder_id")
    .eq("owner_id", user.id);
  if (courseError) throw courseError;
  const courses = (courseRows ?? []) as CourseRow[];
  const courseIds = courses.map((course) => course.id);
  const folderByCourse = new Map(courses.map((course) => [course.id, course.folder_id]));
  if (!courseIds.length) return [];

  const { data: lectureData, error: lectureError } = await client.from("lectures")
    .select("id, course_id, title, join_code, status, current_page, show_question_pins, show_presentation_qr, presentation_qr_position, created_at")
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
  const noteBySlide = new Map<string, string>();
  if (slideRows.length) {
    const { data, error } = await client.from("slide_instructor_notes")
      .select("slide_id, body")
      .in("slide_id", slideRows.map((slide) => slide.id));
    if (error) throw error;
    ((data ?? []) as SlideInstructorNoteRow[]).forEach((note) => noteBySlide.set(note.slide_id, note.body));
  }
  const slidesByVersion = new Map<string, Slide[]>();
  slideRows.forEach((slide) => {
    const rows = slidesByVersion.get(slide.material_version_id) ?? [];
    rows.push({
      id: slide.id,
      pageIndex: slide.page_index,
      title: `Slide ${slide.page_index + 1}`,
      imagePath: slide.image_path,
      imageUrl: client.storage.from("lecture-slides").getPublicUrl(slide.image_path).data.publicUrl,
      speakerNote: noteBySlide.get(slide.id) ?? ""
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
      folderId: folderByCourse.get(lecture.course_id) ?? null,
      code: lecture.join_code,
      courseId: lecture.course_id,
      materialId: material.id,
      materialVersionId: version.id,
      title: lecture.title,
      fileName: material.file_name,
      status: lecture.status,
      currentSlide: lecture.current_page,
      showQuestionPins: lecture.show_question_pins,
      showPresentationQr: lecture.show_presentation_qr,
      presentationQrPosition: lecture.presentation_qr_position,
      createdAt: lecture.created_at,
      slides,
      questions: (questionsByLecture.get(lecture.id) ?? []).map((question) => toQuestion(question, lecture.id, slides))
    }];
  });
}

/** 현재 강사가 소유한 슬라이드의 발표 메모만 생성하거나 갱신한다. */
export async function saveSlideInstructorNote(slideId: string, body: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  await requireOwnerUser();
  const { error } = await client.from("slide_instructor_notes").upsert({
    slide_id: slideId,
    body,
    updated_at: new Date().toISOString()
  }, { onConflict: "slide_id" });
  if (error) throw error;
}

export async function fetchLiveSession(joinCode: string): Promise<ClassSession | null> {
  const client = getAudienceSupabaseClient();
  if (!client) return null;
  await ensureAnonymousUser();
  const { data: lecture, error } = await client.from("lectures")
    .select("id, course_id, title, join_code, status, current_page, show_question_pins, show_presentation_qr, presentation_qr_position, created_at")
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
    folderId: null,
    code: lecture.join_code,
    courseId: lecture.course_id,
    materialId: material.id,
    materialVersionId: version.id,
    title: lecture.title,
    fileName: material.file_name,
    status: "live",
    currentSlide: lecture.current_page,
    showQuestionPins: lecture.show_question_pins,
    showPresentationQr: lecture.show_presentation_qr,
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

export async function submitPlatformExperienceResponse(
  source: PlatformExperienceSource,
  code: string,
  experience: string,
  improvement: string
) {
  const client = getAudienceSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await ensureAnonymousUser();
  if (!user) throw new Error("참여 세션을 만들지 못했습니다.");
  const { error } = await client.rpc("submit_platform_experience_response", {
    target_platform: source,
    target_code: code,
    target_experience: experience,
    target_improvement: improvement
  });
  if (error) throw error;
}

export async function updateLecture(sessionId: string, values: {
  current_page?: number;
  status?: "live" | "ended";
  show_question_pins?: boolean;
  show_presentation_qr?: boolean;
  presentation_qr_position?: ClassSession["presentationQrPosition"];
}) {
  const client = getSupabaseClient();
  if (!client) return;
  await requireOwnerUser();
  const { error } = await client.from("lectures").update(values).eq("id", sessionId);
  if (error) throw error;
}

export function subscribeToLecture(
  sessionId: string,
  materialVersionId: string | undefined,
  onRefresh: () => void,
  onSlidesRefresh: () => void,
  asAudience = false
): RealtimeChannel | null {
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return null;
  // Realtime reuses an existing channel with the same topic. React effects can
  // reconnect before an asynchronous removeChannel() has finished, so give
  // every subscription its own topic to avoid mutating a subscribed channel.
  let channel = client.channel(`lecture:${sessionId}:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "questions", filter: `lecture_id=eq.${sessionId}` }, onRefresh)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lectures", filter: `id=eq.${sessionId}` }, onRefresh);
  if (materialVersionId) {
    channel = channel.on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "slides",
      filter: `material_version_id=eq.${materialVersionId}`
    }, onSlidesRefresh);
  }
  return channel.subscribe();
}

/**
 * 참여자는 종료된 강의 행을 RLS로 읽을 수 없다. 이미 참여 중이던 강의가 조회되지 않으면
 * 종료된 것으로 보고, 짧은 폴링으로 Realtime 이벤트가 필터링되는 경우까지 보완한다.
 */
export async function fetchLectureStatus(
  session: Pick<ClassSession, "id" | "status">,
  asAudience = false
): Promise<ClassSession["status"]> {
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return session.status;
  if (asAudience) await ensureAnonymousUser();
  const { data, error } = await client.from("lectures")
    .select("status")
    .eq("id", session.id)
    .maybeSingle();
  if (error) throw error;
  if (asAudience && !data) return "ended";
  return (data?.status as ClassSession["status"] | undefined) ?? session.status;
}

export async function fetchLectureSnapshot(session: ClassSession, asAudience = false): Promise<Pick<ClassSession, "currentSlide" | "status" | "showQuestionPins" | "showPresentationQr" | "presentationQrPosition" | "questions"> | null> {
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return null;
  if (asAudience) await ensureAnonymousUser();
  const { data: lecture, error: lectureError } = await client.from("lectures")
    .select("current_page, status, show_question_pins, show_presentation_qr, presentation_qr_position")
    .eq("id", session.id)
    .maybeSingle();
  if (lectureError) throw lectureError;
  const { data, error } = await client.from("questions")
    .select("id, slide_id, category, raw_text, status, created_at, region_anchors(kind, coords), answers(body, created_at)")
    .eq("lecture_id", session.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const questions = ((data ?? []) as unknown as QuestionRow[])
    .map((row) => toQuestion({ ...row, lecture_id: session.id }, session.id, session.slides));
  return {
    currentSlide: lecture?.current_page ?? session.currentSlide,
    status: asAudience && !lecture ? "ended" : (lecture?.status as ClassSession["status"]) ?? session.status,
    showQuestionPins: lecture?.show_question_pins ?? session.showQuestionPins,
    showPresentationQr: lecture?.show_presentation_qr ?? session.showPresentationQr,
    presentationQrPosition: (lecture?.presentation_qr_position as ClassSession["presentationQrPosition"]) ?? session.presentationQrPosition,
    questions
  };
}
