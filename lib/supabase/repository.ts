import type { RealtimeChannel } from "@supabase/supabase-js";
import { isQuestionMarker, normalizeClassFolderName, normalizeQuestionCategorySettings, type ClassFolder, type ClassSession, type NormalizedPoint, type Question, type QuestionCategorySettings, type Slide } from "@/lib/types";
import { ensureAnonymousUser, getAudienceSupabaseClient, getOwnerWriteSupabaseClient, getSessionUser, getSupabaseClient } from "./client";

export type PlatformExperienceSource = "lecture" | "feedback";

type LectureRow = {
  id: string;
  course_id: string;
  title: string;
  join_code: string;
  status: ClassSession["status"];
  current_page: number;
  presentation_interactions: boolean;
  show_question_pins: boolean;
  show_presentation_qr: boolean;
  presentation_qr_position: ClassSession["presentationQrPosition"];
  question_categories: unknown;
  created_at: string;
};

export type LectureRealtimeRow = Pick<LectureRow,
  "current_page" | "status" | "presentation_interactions" | "show_question_pins" |
  "show_presentation_qr" | "presentation_qr_position" | "question_categories"
>;

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

type FeedbackCampaignImportRow = {
  id: string;
  folder_id: string | null;
  title: string;
  feedback_categories: unknown;
};

type FeedbackCampaignPageImportRow = {
  id: string;
  campaign_id: string;
  page_index: number;
  image_path: string;
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
    presentation_interactions: session.presentationInteractions,
    show_question_pins: session.showQuestionPins,
    show_presentation_qr: session.showPresentationQr,
    presentation_qr_position: session.presentationQrPosition,
    question_categories: session.questionCategories,
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

const feedbackImportSource = (campaignId: string) => `pin-feedback/${campaignId}`;
const feedbackImportCode = () => `IMP${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;

/** 원본 캠페인과 이미지는 그대로 두고 현재 강사의 아직 가져오지 않은 자료만 복제한다. */
export async function importOwnedFeedbackCampaigns(): Promise<number> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await requireOwnerUser();
  const { data: campaignData, error: campaignError } = await client.from("campaigns")
    .select("id, folder_id, title, feedback_categories")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });
  if (campaignError) throw campaignError;
  const campaigns = (campaignData ?? []) as FeedbackCampaignImportRow[];
  if (!campaigns.length) return 0;

  const [{ data: pageData, error: pageError }, { data: versionData, error: versionError }] = await Promise.all([
    client.from("campaign_pages")
      .select("id, campaign_id, page_index, image_path")
      .in("campaign_id", campaigns.map((campaign) => campaign.id))
      .order("page_index", { ascending: true }),
    client.from("material_versions").select("source_path").like("source_path", "pin-feedback/%")
  ]);
  if (pageError) throw pageError;
  if (versionError) throw versionError;
  const pages = (pageData ?? []) as FeedbackCampaignPageImportRow[];
  const importedSources = new Set((versionData ?? []).map((version) => version.source_path as string));
  let imported = 0;

  for (const campaign of campaigns) {
    const sourcePath = feedbackImportSource(campaign.id);
    if (importedSources.has(sourcePath)) continue;
    const campaignPages = pages.filter((page) => page.campaign_id === campaign.id);
    if (!campaignPages.length) throw new Error(`복사할 페이지가 없는 PinFeedback 자료입니다: ${campaign.title}`);

    const courseId = crypto.randomUUID();
    const lectureId = crypto.randomUUID();
    const materialId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const uploadedPaths: string[] = [];
    const slideMappings: Array<{ id: string; source_page_id: string; page_index: number; image_path: string }> = [];
    try {
      for (const page of campaignPages) {
        const { data: image, error: downloadError } = await client.storage.from("campaign-images").download(page.image_path);
        if (downloadError) throw downloadError;
        const extension = page.image_path.toLowerCase().endsWith(".png") ? "png" : page.image_path.toLowerCase().endsWith(".webp") ? "webp" : "jpg";
        const slideId = crypto.randomUUID();
        const imagePath = `${user.id}/${lectureId}/pin-feedback/${slideId}.${extension}`;
        const { error: uploadError } = await client.storage.from("lecture-slides").upload(imagePath, image, {
          contentType: image.type || (extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg"),
          upsert: false
        });
        if (uploadError) throw uploadError;
        uploadedPaths.push(imagePath);
        slideMappings.push({ id: slideId, source_page_id: page.id, page_index: page.page_index, image_path: imagePath });
      }

      const questionCategories: QuestionCategorySettings = normalizeQuestionCategorySettings(campaign.feedback_categories);
      const { data: importedLectureId, error: importError } = await client.rpc("import_feedback_campaign", {
        target_campaign_id: campaign.id,
        target_course_id: courseId,
        target_lecture_id: lectureId,
        target_material_id: materialId,
        target_version_id: versionId,
        target_join_code: feedbackImportCode(),
        target_slides: slideMappings,
        target_question_categories: questionCategories
      });
      if (importError) throw importError;
      if (importedLectureId !== lectureId) {
        await client.storage.from("lecture-slides").remove(uploadedPaths);
        importedSources.add(sourcePath);
        continue;
      }
      importedSources.add(sourcePath);
      imported += 1;
    } catch (error) {
      if (uploadedPaths.length) {
        const { error: cleanupError } = await client.storage.from("lecture-slides").remove(uploadedPaths);
        if (cleanupError) console.error("PinFeedback import cleanup failed", cleanupError);
      }
      throw error;
    }
  }

  return imported;
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

export async function renameClassFolder(folderId: string, name: string): Promise<void> {
  const normalizedName = normalizeClassFolderName(name);
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await requireOwnerUser();
  const { data, error } = await client.from("session_folders")
    .update({ name: normalizedName })
    .eq("id", folderId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("이름을 바꿀 폴더를 찾지 못했습니다.");
}

export async function deleteClassFolder(folderId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await requireOwnerUser();
  const { data, error } = await client.from("session_folders")
    .delete()
    .eq("id", folderId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("삭제할 폴더를 찾지 못했습니다.");
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

/** 코스와 cascade 데이터를 지운 뒤 더는 참조되지 않는 원본·렌더 이미지를 회수한다. */
export async function deleteClassSession(courseId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  const user = await requireOwnerUser();
  const { data: materialData, error: materialError } = await client.from("materials")
    .select("id")
    .eq("course_id", courseId);
  if (materialError) throw materialError;
  const materialIds = (materialData ?? []).map((material) => material.id as string);

  let sourcePaths: string[] = [];
  let imagePaths: string[] = [];
  if (materialIds.length) {
    const { data: versionData, error: versionError } = await client.from("material_versions")
      .select("id, source_path")
      .in("material_id", materialIds);
    if (versionError) throw versionError;
    const versions = (versionData ?? []) as Array<{ id: string; source_path: string }>;
    sourcePaths = [...new Set(versions.map((version) => version.source_path).filter((path) => path.startsWith(`${user.id}/`)))];
    const versionIds = versions.map((version) => version.id);
    if (versionIds.length) {
      const { data: slideData, error: slideError } = await client.from("slides")
        .select("image_path")
        .in("material_version_id", versionIds);
      if (slideError) throw slideError;
      imagePaths = [...new Set((slideData ?? []).map((slide) => slide.image_path as string).filter((path) => path.startsWith(`${user.id}/`)))];
    }
  }

  const { data, error } = await client.from("courses")
    .delete()
    .eq("id", courseId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("삭제할 강의 자료를 찾지 못했습니다.");

  const cleanup = [
    sourcePaths.length ? client.storage.from("course-materials").remove(sourcePaths) : null,
    imagePaths.length ? client.storage.from("lecture-slides").remove(imagePaths) : null
  ].filter((request): request is NonNullable<typeof request> => request !== null);
  const results = await Promise.all(cleanup);
  results.forEach(({ error: storageError }) => {
    // DB 삭제는 이미 끝났다. 재시도로 복구할 수 없는 전체 실패로 보이지 않는다.
    if (storageError) console.error("Deleted class material storage cleanup failed", storageError);
  });
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
    .select("id, course_id, title, join_code, status, current_page, presentation_interactions, show_question_pins, show_presentation_qr, presentation_qr_position, question_categories, created_at")
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
    .select("id, lecture_id, slide_id, category, marker, raw_text, status, reaction_count, created_at, region_anchors(kind, coords), answers(body, created_at)")
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
      presentationInteractions: lecture.presentation_interactions,
      showQuestionPins: lecture.show_question_pins,
      showPresentationQr: lecture.show_presentation_qr,
      presentationQrPosition: lecture.presentation_qr_position,
      questionCategories: normalizeQuestionCategorySettings(lecture.question_categories),
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
    .select("id, course_id, title, join_code, status, current_page, presentation_interactions, show_question_pins, show_presentation_qr, presentation_qr_position, question_categories, created_at")
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
    presentationInteractions: lecture.presentation_interactions,
    showQuestionPins: lecture.show_question_pins,
    showPresentationQr: lecture.show_presentation_qr,
    presentationQrPosition: lecture.presentation_qr_position,
    questionCategories: normalizeQuestionCategorySettings(lecture.question_categories),
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
  const { error } = await client.from("questions").insert({ id: question.id, course_id: session.courseId, lecture_id: session.id, slide_id: slide.id, region_id: regionId, author_id: user.id, is_anonymous: true, category: question.category, marker: question.marker, raw_text: question.text, status: "unanswered", occurred_in: "live" });
  if (error) throw error;
}

export async function updateQuestion(questionId: string, values: Pick<Question, "category" | "marker" | "text">) {
  const client = getAudienceSupabaseClient();
  if (!client) return;
  await ensureAnonymousUser();
  const { data, error } = await client.from("questions")
    .update({ category: values.category, marker: values.marker, raw_text: values.text, updated_at: new Date().toISOString() })
    .eq("id", questionId)
    .eq("status", "unanswered")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("수정할 수 있는 질문을 찾지 못했습니다.");
}

export async function setQuestionReaction(questionId: string, reacted: boolean) {
  const client = getAudienceSupabaseClient();
  if (!client) return;
  await ensureAnonymousUser();
  const { error } = await client.rpc("set_question_reaction", {
    target_question_id: questionId,
    target_reacted: reacted
  });
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
  presentation_interactions?: boolean;
  show_question_pins?: boolean;
  show_presentation_qr?: boolean;
  presentation_qr_position?: ClassSession["presentationQrPosition"];
  question_categories?: QuestionCategorySettings;
}) {
  const client = getOwnerWriteSupabaseClient();
  if (!client) return;
  // The authenticated request is already checked by the lectures owner RLS policy.
  // Asking PostgREST for the affected-row count keeps the write to one request
  // without returning and decoding a row just to detect a missing/denied target.
  const { count, error } = await client.from("lectures")
    .update(values, { count: "exact" })
    .eq("id", sessionId);
  if (error) throw error;
  if (count !== 1) throw new Error("저장할 수 있는 강의를 찾지 못했습니다.");
}

export function subscribeToLecture(
  sessionId: string,
  materialVersionId: string | undefined,
  onQuestionsRefresh: () => void,
  onLectureUpdate: (lecture: LectureRealtimeRow) => void,
  onSlidesRefresh: () => void,
  asAudience = false
): RealtimeChannel | null {
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
  return channel.subscribe();
}

export async function fetchLectureSnapshot(session: ClassSession, asAudience = false): Promise<Pick<ClassSession, "currentSlide" | "status" | "presentationInteractions" | "showQuestionPins" | "showPresentationQr" | "presentationQrPosition" | "questionCategories" | "questions"> | null> {
  const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
  if (!client) return null;
  if (asAudience) await ensureAnonymousUser();
  const { data: lecture, error: lectureError } = await client.from("lectures")
    .select("current_page, status, presentation_interactions, show_question_pins, show_presentation_qr, presentation_qr_position, question_categories")
    .eq("id", session.id)
    .maybeSingle();
  if (lectureError) throw lectureError;
  const questionResult = asAudience
    ? await client.rpc("find_lecture_questions", { target_lecture_id: session.id })
    : await client.from("questions")
      .select("id, slide_id, category, marker, raw_text, status, reaction_count, created_at, region_anchors(kind, coords), answers(body, created_at)")
      .eq("lecture_id", session.id)
      .order("created_at", { ascending: false });
  const { data, error } = questionResult;
  if (error) throw error;
  const questions = (Array.isArray(data) ? data as unknown as QuestionRow[] : [])
    .map((row) => toQuestion({ ...row, lecture_id: session.id }, session.id, session.slides));
  return {
    currentSlide: lecture?.current_page ?? session.currentSlide,
    status: asAudience && !lecture ? "ended" : (lecture?.status as ClassSession["status"]) ?? session.status,
    presentationInteractions: lecture?.presentation_interactions ?? session.presentationInteractions,
    showQuestionPins: lecture?.show_question_pins ?? session.showQuestionPins,
    showPresentationQr: lecture?.show_presentation_qr ?? session.showPresentationQr,
    presentationQrPosition: (lecture?.presentation_qr_position as ClassSession["presentationQrPosition"]) ?? session.presentationQrPosition,
    questionCategories: normalizeQuestionCategorySettings(lecture?.question_categories ?? session.questionCategories),
    questions
  };
}
