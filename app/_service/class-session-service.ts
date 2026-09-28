import { isParticipantPointAnchor, isQuestionMarker, normalizeClassFolderColorIndex, normalizeClassFolderName, normalizeClassFolderPurpose, normalizeClassFolderPurposeLabel, normalizeQuestionCategorySettings, type ClassFolder, type ClassSession, type CreateClassFolderInput, type NormalizedPoint, type Question, type QuestionCategorySettings, type Slide } from "@/app/_model/types";
import { ensureAnonymousUser, getAudienceSupabaseClient, getSessionUser, getSupabaseClient, supabaseConfigured } from "@/app/_infrastructure/supabase/client";

import { restRequest } from "@/app/_infrastructure/rest/request";
export const classSessionPersistenceEnabled = supabaseConfigured;

type LectureRow = {
  id: string;
  course_id: string;
  title: string;
  join_code: string;
  status: ClassSession["status"];
  current_page: number;
  presentation_interactions: boolean;
  presentation_autoplay: boolean;
  show_question_pins: boolean;
  show_presentation_qr: boolean;
  presentation_qr_position: ClassSession["presentationQrPosition"];
  question_categories: unknown;
  created_at: string;
};

export type LectureRealtimeRow = Pick<LectureRow,
  "current_page" | "status" | "presentation_interactions" | "presentation_autoplay" | "show_question_pins" |
  "show_presentation_qr" | "presentation_qr_position" | "question_categories"
>;

type ClassFolderRow = {
  id: string;
  name: string;
  created_at: string;
  color_index: number;
  purpose: unknown;
  purpose_label: unknown;
};

type SlideRow = {
  id: string;
  material_version_id: string;
  page_index: number;
  image_path: string | null;
  source_page_index: number | null;
};

type SlideInstructorNoteRow = {
  slide_id: string;
  body: string;
};

type DeletedSlideRow = {
  deleted_image_path: string | null;
  deleted_page_index: number;
  deleted_question_count: number;
};

type QuestionRow = {
  id: string;
  lecture_id: string;
  slide_id: string | null;
  category: Question["category"];
  marker?: unknown;
  raw_text: string;
  status: Question["status"];
  reaction_count?: number;
  reacted_by_me?: boolean;
  is_mine?: boolean;
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

type OwnedCourseGraphRow = {
  id: string;
  folder_id: string | null;
  lectures: Array<LectureRow & {
    materials: Array<{
      id: string;
      file_name: string;
      created_at: string;
      material_versions: Array<{
        id: string;
        version_no: number;
        source_path: string;
        slides: Array<SlideRow & {
          slide_instructor_notes: SlideInstructorNoteRow | SlideInstructorNoteRow[] | null;
        }>;
      }>;
    }>;
    questions: QuestionRow[];
  }>;
};

type AudienceLectureGraphRow = LectureRow & {
  materials: Array<{
    id: string;
    file_name: string;
    material_versions: Array<{
      id: string;
      version_no: number;
      source_path: string;
      slides: SlideRow[];
    }>;
  }>;
};

const PDF_URL_TTL_SECONDS = 12 * 60 * 60;

async function createPdfUrlMap(client: NonNullable<ReturnType<typeof getSupabaseClient>>, paths: string[]) {
  const uniquePaths = [...new Set(paths)];
  if (!uniquePaths.length) return new Map<string, string>();
  const { data, error } = await client.storage.from("course-materials").createSignedUrls(uniquePaths, PDF_URL_TTL_SECONDS);
  if (error) throw error;
  const urls = new Map<string, string>();
  data.forEach((item) => {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  });
  if (urls.size !== uniquePaths.length) throw new Error("PDF 원본을 읽을 수 없습니다.");
  return urls;
}

function toSlide(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  row: SlideRow,
  pdfUrl?: string,
  speakerNote?: string,
): Slide {
  return {
    id: row.id,
    pageIndex: row.page_index,
    title: `Slide ${row.page_index + 1}`,
    ...(row.image_path ? {
      imagePath: row.image_path,
      imageUrl: client.storage.from("lecture-slides").getPublicUrl(row.image_path).data.publicUrl,
    } : {}),
    ...(typeof row.source_page_index === "number" ? {
      sourcePageIndex: row.source_page_index,
      ...(pdfUrl ? { pdfUrl } : {}),
    } : {}),
    ...(speakerNote === undefined ? {} : { speakerNote }),
  };
}

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

function toQuestion(row: QuestionRow, sessionId: string, slideIndexById: ReadonlyMap<string, number>): Question {
  const anchorValue = row.region_anchors;
  const anchor = Array.isArray(anchorValue) ? anchorValue[0] : anchorValue;
  const path = toNormalizedPath(anchor?.coords?.points);
  const answerRows = [...(row.answers ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return {
    id: row.id,
    sessionId,
    slideIndex: row.slide_id ? slideIndexById.get(row.slide_id) ?? 0 : 0,
    x: anchor?.coords?.x ?? path?.[0]?.x ?? null,
    y: anchor?.coords?.y ?? path?.[0]?.y ?? null,
    anchorKind: anchor?.kind === "path" && path ? "path" : anchor?.kind === "box" ? "box" : "point",
    width: anchor?.coords?.width ?? null,
    height: anchor?.coords?.height ?? null,
    path,
    category: row.category,
    marker: isQuestionMarker(row.marker) ? row.marker : "pin",
    text: row.raw_text,
    status: row.status,
    answer: answerRows[answerRows.length - 1]?.body,
    isMine: row.is_mine ?? false,
    reactionCount: Math.max(0, row.reaction_count ?? 0),
    reactedByMe: row.reacted_by_me ?? false,
    createdAt: row.created_at
  };
}

function toQuestions(rows: QuestionRow[], sessionId: string, slides: Slide[]): Question[] {
  const slideIndexById = new Map(slides.map((slide) => [slide.id, slide.pageIndex]));
  return [...rows]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((row) => toQuestion(row, sessionId, slideIndexById));
}

export async function persistSession(session: ClassSession, sourcePath?: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  if (!session.courseId || !session.materialId || !session.materialVersionId) throw new Error("강의 저장 정보가 완전하지 않습니다.");
  const user = await requireOwnerUser();
  const slides = [];
  for (const slide of session.slides) {
    let imagePath = slide.imagePath ?? "";
    if (!imagePath && slide.imageUrl) {
      imagePath = `${user.id}/${session.id}/${slide.id}.jpg`;
      const image = await fetch(slide.imageUrl).then((response) => response.blob());
      const { error } = await client.storage.from("lecture-slides").upload(imagePath, image, { contentType: image.type || "image/jpeg", upsert: false });
      if (error) throw error;
    }
    if ((imagePath ? 1 : 0) + (slide.sourcePageIndex === undefined ? 0 : 1) !== 1) {
      throw new Error("슬라이드 원본 정보가 완전하지 않습니다.");
    }
    slides.push({ id: slide.id, pageIndex: slide.pageIndex, imagePath: imagePath || null, sourcePageIndex: slide.sourcePageIndex ?? null });
  }
  await restRequest(client, "/instructor/materials", "POST", {
    id: session.id, courseId: session.courseId, materialId: session.materialId, materialVersionId: session.materialVersionId,
    folderId: session.folderId, title: session.title, fileName: session.fileName,
    sourcePath: sourcePath ?? `${user.id}/${session.id}/${session.fileName}`,
    code: session.code, status: session.status, currentSlide: session.currentSlide,
    presentationInteractions: session.presentationInteractions, showQuestionPins: session.showQuestionPins,
    showPresentationQr: session.showPresentationQr, presentationQrPosition: session.presentationQrPosition,
    questionCategories: session.questionCategories, slides,
  });
  if (session.presentationAutoplay) await updateLecture(session.id, { presentation_autoplay: true });
}

const toClassFolder = (folder: ClassFolderRow): ClassFolder => {
  const purpose = normalizeClassFolderPurpose(folder.purpose);
  return {
    id: folder.id,
    name: folder.name,
    createdAt: folder.created_at,
    colorIndex: folder.color_index,
    purpose,
    purposeLabel: normalizeClassFolderPurposeLabel(purpose, folder.purpose_label)
  };
};

export async function fetchOwnedClassFolders(): Promise<ClassFolder[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const rows = await restRequest<ClassFolderRow[]>(client, "/instructor/folders");
  return rows.map(toClassFolder);
}

export async function createClassFolder(input: CreateClassFolderInput): Promise<ClassFolder> {
  const name = normalizeClassFolderName(input.name);
  const colorIndex = normalizeClassFolderColorIndex(input.colorIndex);
  const purpose = normalizeClassFolderPurpose(input.purpose);
  const purposeLabel = normalizeClassFolderPurposeLabel(purpose, input.purposeLabel);
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  return toClassFolder(await restRequest<ClassFolderRow>(client, "/instructor/folders", "POST", { name, colorIndex, purpose, purposeLabel }));
}

export async function renameClassFolder(folderId: string, name: string): Promise<void> {
  const normalizedName = normalizeClassFolderName(name);
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  await restRequest(client, `/instructor/folders/${encodeURIComponent(folderId)}`, "PATCH", { name: normalizedName });
}

export async function deleteClassFolder(folderId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  await restRequest(client, `/instructor/folders/${encodeURIComponent(folderId)}`, "DELETE");
}

export async function moveSessionToFolder(courseId: string, folderId: string | null): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  await restRequest(client, `/instructor/courses/${encodeURIComponent(courseId)}/folder`, "PATCH", { folderId });
}

/** 코스와 cascade 데이터를 지운 뒤 더는 참조되지 않는 원본·렌더 이미지를 회수한다. */
export async function deleteClassSession(courseId: string): Promise<{ cleanupPending: boolean }> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  return restRequest(client, `/instructor/courses/${encodeURIComponent(courseId)}`, "DELETE");
}

/** 슬라이드와 연결 데이터를 DB에서 삭제한 뒤 공개 Storage 객체를 회수한다. */
export async function deleteSessionSlide(slideId: string): Promise<DeletedSlideRow & { cleanupPending: boolean }> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const deleted = await restRequest<DeletedSlideRow>(client, `/instructor/slides/${encodeURIComponent(slideId)}`, "DELETE");
  if (!deleted) throw new Error("삭제된 슬라이드 정보를 받지 못했습니다.");
  // Deletion has committed; a cleanup failure must never roll back the slide in the UI.
  let cleanupPending = true;
  try {
    ({ cleanupPending } = await restRequest<{ cleanupPending: boolean }>(client, "/instructor/storage-cleanup", "POST"));
  } catch (error) { console.error("Deleted slide storage cleanup pending", error); }
  return { ...deleted, cleanupPending };
}

/** Realtime INSERT 뒤 현재 자료 버전의 전체 슬라이드를 다시 읽는다. */
export async function fetchSessionSlides(session: ClassSession, asAudience = false): Promise<Slide[]> {
  if (!session.materialVersionId) return session.slides;
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return session.slides;
  if (asAudience) await ensureAnonymousUser();
  const rows = await restRequest<Array<SlideRow & { slide_instructor_notes?: SlideInstructorNoteRow | SlideInstructorNoteRow[] | null }>>(
    client, `/${asAudience ? "participant" : "instructor"}/versions/${encodeURIComponent(session.materialVersionId)}/slides`
  );
  const pdfUrl = session.slides.find((slide) => slide.pdfUrl)?.pdfUrl;
  return rows.map((slide) => {
    const note = Array.isArray(slide.slide_instructor_notes) ? slide.slide_instructor_notes[0] : slide.slide_instructor_notes;
    return toSlide(client, slide, pdfUrl, asAudience ? undefined : note?.body ?? "");
  });
}

/** 현재 Google 강사가 소유한 강의 전체를 DB에서 복원한다. */
export async function fetchOwnedSessions(): Promise<ClassSession[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const courses = await restRequest<OwnedCourseGraphRow[]>(client, "/instructor/courses");
  const pdfUrls = await createPdfUrlMap(client, courses.flatMap((course) => course.lectures.flatMap((lecture) =>
    lecture.materials.flatMap((material) => material.material_versions
      .filter((version) => version.slides.some((slide) => slide.source_page_index !== null))
      .map((version) => version.source_path))
  )));

  return courses
    .flatMap((course) => course.lectures.map((lecture) => ({ course, lecture })))
    .sort((a, b) => b.lecture.created_at.localeCompare(a.lecture.created_at))
    .flatMap(({ course, lecture }) => {
      const material = [...lecture.materials].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      const version = material && [...material.material_versions].sort((a, b) => b.version_no - a.version_no)[0];
      if (!material || !version) return [];
      const slides = [...version.slides]
        .sort((a, b) => a.page_index - b.page_index)
        .map((slide): Slide => {
          const noteValue = slide.slide_instructor_notes;
          const note = Array.isArray(noteValue) ? noteValue[0] : noteValue;
          return toSlide(client, slide, pdfUrls.get(version.source_path), note?.body ?? "");
        });
      const questions = toQuestions(lecture.questions, lecture.id, slides);
      return [{
        id: lecture.id,
        folderId: course.folder_id,
        code: lecture.join_code,
        courseId: course.id,
        materialId: material.id,
        materialVersionId: version.id,
        title: lecture.title,
        fileName: material.file_name,
        status: lecture.status,
        currentSlide: lecture.current_page,
        presentationInteractions: lecture.presentation_interactions,
        presentationAutoplay: lecture.presentation_autoplay,
        showQuestionPins: lecture.show_question_pins,
        showPresentationQr: lecture.show_presentation_qr,
        presentationQrPosition: lecture.presentation_qr_position,
        questionCategories: normalizeQuestionCategorySettings(lecture.question_categories),
        createdAt: lecture.created_at,
        slides,
        questions
      }];
    });
}

/** 현재 강사가 소유한 슬라이드의 발표 메모만 생성하거나 갱신한다. */
export async function saveSlideInstructorNote(slideId: string, body: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  await restRequest(client, `/instructor/slides/${encodeURIComponent(slideId)}/note`, "PUT", { body });
}

async function fetchLiveSessionBy(column: "id" | "join_code", value: string): Promise<ClassSession | null> {
  const client = getAudienceSupabaseClient();
  if (!client) return null;
  await ensureAnonymousUser();
  const path = column === "join_code" ? `/participant/join/${encodeURIComponent(value)}` : `/participant/lectures/${encodeURIComponent(value)}`;
  const lecture = await restRequest<AudienceLectureGraphRow | null>(client, path);
  if (!lecture) return null;
  const material = lecture.materials[0];
  const version = material && [...material.material_versions].sort((a, b) => b.version_no - a.version_no)[0];
  if (!material || !version) return null;
  const pdfUrls = await createPdfUrlMap(
    client,
    version.slides.some((slide) => slide.source_page_index !== null) ? [version.source_path] : [],
  );
  const slides: Slide[] = [...version.slides]
    .sort((a, b) => a.page_index - b.page_index)
    .map((slide) => toSlide(client, slide, pdfUrls.get(version.source_path)));
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
    presentationInteractions: lecture.presentation_interactions,
    presentationAutoplay: lecture.presentation_autoplay,
    showQuestionPins: lecture.show_question_pins,
    showPresentationQr: lecture.show_presentation_qr,
    presentationQrPosition: lecture.presentation_qr_position,
    questionCategories: normalizeQuestionCategorySettings(lecture.question_categories),
    createdAt: lecture.created_at,
    slides,
    questions: []
  };
  const questionData = await restRequest<QuestionRow[]>(client, `/participant/lectures/${encodeURIComponent(session.id)}/questions`);
  return {
    ...session,
    questions: toQuestions(Array.isArray(questionData) ? questionData as unknown as QuestionRow[] : [], session.id, slides)
  };
}

export function fetchLiveSession(joinCode: string) {
  return fetchLiveSessionBy("join_code", joinCode.toUpperCase());
}

export function fetchLiveSessionById(sessionId: string) {
  return fetchLiveSessionBy("id", sessionId);
}

export async function submitQuestion(session: ClassSession, question: Question) {
  const client = getAudienceSupabaseClient();
  if (!client) return;
  if (!isParticipantPointAnchor(question)) throw new Error("Participant questions require a point anchor.");
  const user = await ensureAnonymousUser();
  if (!user || !session.courseId) throw new Error("Supabase session is missing ownership context.");
  const slide = session.slides[question.slideIndex];
  if (!slide) throw new Error("질문을 남길 슬라이드를 찾지 못했습니다.");
  await restRequest(client, `/participant/lectures/${encodeURIComponent(session.id)}/questions`, "POST", {
    id: question.id, slideId: slide.id, x: question.x, y: question.y,
    category: question.category, marker: question.marker, text: question.text,
  });
}

export async function updateQuestion(questionId: string, values: Pick<Question, "category" | "marker" | "text">) {
  const client = getAudienceSupabaseClient();
  if (!client) return;
  await ensureAnonymousUser();
  await restRequest(client, `/participant/questions/${encodeURIComponent(questionId)}`, "PATCH", values);
}

export async function setQuestionReaction(questionId: string, reacted: boolean) {
  const client = getAudienceSupabaseClient();
  if (!client) return;
  await ensureAnonymousUser();
  await restRequest(client, `/participant/questions/${encodeURIComponent(questionId)}/reaction`, "PUT", { reacted });
}

export async function postAnswer(questionId: string, body: string) {
  const client = getSupabaseClient();
  if (!client) return;
  await restRequest(client, `/instructor/questions/${encodeURIComponent(questionId)}/answers`, "POST", { body });
}

export async function markQuestionResolved(questionId: string) {
  const client = getSupabaseClient();
  if (!client) return;
  await restRequest(client, `/instructor/questions/${encodeURIComponent(questionId)}/resolved`, "PUT");
}

export async function updateLecture(sessionId: string, values: {
  current_page?: number;
  status?: "live" | "ended";
  presentation_interactions?: boolean;
  presentation_autoplay?: boolean;
  show_question_pins?: boolean;
  show_presentation_qr?: boolean;
  presentation_qr_position?: ClassSession["presentationQrPosition"];
  question_categories?: QuestionCategorySettings;
}) {
  const client = getSupabaseClient();
  if (!client) return;
  await restRequest(client, `/instructor/lectures/${encodeURIComponent(sessionId)}`, "PATCH", values);
}

export function subscribeToLecture(
  sessionId: string,
  materialVersionId: string | undefined,
  onQuestionsRefresh: () => void,
  onLectureUpdate: (lecture: LectureRealtimeRow) => void,
  onSlidesRefresh: () => void,
  asAudience = false
): (() => void) | null {
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return null;
  // Realtime reuses an existing channel with the same topic. React effects can
  // reconnect before an asynchronous removeChannel() has finished, so give
  // every subscription its own topic to avoid mutating a subscribed channel.
  let channel = client.channel(`lecture:${sessionId}:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "questions", filter: `lecture_id=eq.${sessionId}` }, onQuestionsRefresh)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lectures", filter: `id=eq.${sessionId}` }, (payload) => {
      onLectureUpdate(payload.new as LectureRealtimeRow);
    });
  if (materialVersionId) {
    channel = channel.on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "slides",
      filter: `material_version_id=eq.${materialVersionId}`
    }, onSlidesRefresh);
  }
  channel.subscribe();
  return () => { void client.removeChannel(channel); };
}

export async function fetchLectureSnapshot(session: ClassSession, asAudience = false): Promise<Pick<ClassSession, "currentSlide" | "status" | "presentationInteractions" | "presentationAutoplay" | "showQuestionPins" | "showPresentationQr" | "presentationQrPosition" | "questionCategories" | "questions"> | null> {
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return null;
  if (asAudience) await ensureAnonymousUser();
  const base = `/${asAudience ? "participant" : "instructor"}/lectures/${encodeURIComponent(session.id)}`;
  const [lecture, data] = await Promise.all([
    restRequest<LectureRow | null>(client, `${base}/state`),
    restRequest<QuestionRow[]>(client, `${base}/questions`),
  ]);
  const questions = toQuestions(
    Array.isArray(data) ? data as unknown as QuestionRow[] : [],
    session.id,
    session.slides
  );
  return {
    currentSlide: lecture?.current_page ?? session.currentSlide,
    status: asAudience && !lecture ? "ended" : (lecture?.status as ClassSession["status"]) ?? session.status,
    presentationInteractions: lecture?.presentation_interactions ?? session.presentationInteractions,
    presentationAutoplay: lecture?.presentation_autoplay ?? session.presentationAutoplay,
    showQuestionPins: lecture?.show_question_pins ?? session.showQuestionPins,
    showPresentationQr: lecture?.show_presentation_qr ?? session.showPresentationQr,
    presentationQrPosition: (lecture?.presentation_qr_position as ClassSession["presentationQrPosition"]) ?? session.presentationQrPosition,
    questionCategories: normalizeQuestionCategorySettings(lecture?.question_categories ?? session.questionCategories),
    questions
  };
}
