import { Upload } from "tus-js-client";
import { getSupabaseClient, getUploadSession } from "@/app/_infrastructure/supabase/client";
import type { Slide } from "@/app/_model/types";
import {
  createPdfSlides,
  MAX_SOURCE_FILE_BYTES,
  SOURCE_CONTENT_TYPES,
  SOURCE_FILE_TOO_LARGE_ERROR,
  sourceFileExtension,
  type SourceFileExtension,
} from "@/app/_model/upload";

export type ConvertCallbacks = {
  /** 업로드 진행률(0~1). 브라우저가 서버로 바이트를 올리는 동안 호출된다. */
  onUploadProgress?: (fraction: number) => void;
  /** 전체 페이지 수를 확인했을 때 한 번 알려준다. */
  onMeta?: (total: number) => void;
  /** 표시 가능한 슬라이드가 준비될 때마다 호출된다. PPT/PPTX는 도착 순이라 페이지 순이 아닐 수 있다. */
  onSlide?: (slide: Slide, total: number) => void;
};

type ConvertEvent =
  | { type: "meta"; total: number }
  | { type: "slide"; slide: Slide }
  | { type: "done" }
  | { type: "error"; error?: string };

const SOURCE_BUCKET = "course-materials";
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

function uploadSource(
  file: File,
  extension: SourceFileExtension,
  auth: { accessToken: string; userId: string },
  onProgress?: (fraction: number) => void,
) {
  let sourcePath = `${auth.userId}/${crypto.randomUUID()}/source${extension}`;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const endpoint = `${projectUrl.replace(".supabase.co", ".storage.supabase.co")}/storage/v1/upload/resumable`;

  return new Promise<string>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint,
      chunkSize: TUS_CHUNK_BYTES,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${auth.accessToken}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      },
      metadata: {
        bucketName: SOURCE_BUCKET,
        objectName: sourcePath,
        contentType: SOURCE_CONTENT_TYPES[extension],
        cacheControl: "3600",
      },
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onError: reject,
      onSuccess: () => resolve(sourcePath),
    });
    upload.findPreviousUploads()
      .then((previous) => {
        const resumable = previous.find(({ metadata }) =>
          metadata.bucketName === SOURCE_BUCKET
          && metadata.objectName?.startsWith(`${auth.userId}/`)
          && metadata.objectName.endsWith(extension)
        );
        if (resumable) {
          sourcePath = resumable.metadata.objectName;
          upload.resumeFromPreviousUpload(resumable);
        }
        upload.start();
      })
      .catch(reject);
  });
}

async function removeSource(sourcePath: string) {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.storage.from(SOURCE_BUCKET).remove([sourcePath]);
  if (error) console.error("Source material cleanup failed:", error.message);
}

/**
 * 강의 자료를 슬라이드 표시 데이터로 준비한다. 업로드 화면들이 함께 쓴다.
 *
 * 신규 PDF는 원본의 페이지 수만 브라우저에서 읽고 그대로 사용한다. PPT/PPTX는
 * 서버가 NDJSON을 흘려보내므로 responseText를 증분 파싱해 변환 이미지를 받는다.
 * 인증이 없는 로컬 데모는 원본을 보존할 로컬 URL을 만들기 위해 API를 사용한다.
 */
export async function convertToSlides(file: File, callbacks?: ConvertCallbacks): Promise<{ slides: Slide[]; sourcePath?: string }> {
  const extension = sourceFileExtension(file.name);
  if (!extension) throw new Error("PDF 또는 PPT 파일만 지원합니다.");
  if (file.size > MAX_SOURCE_FILE_BYTES) throw new Error(SOURCE_FILE_TOO_LARGE_ERROR);

  const auth = await getUploadSession();
  let sourcePath: string | undefined;
  if (extension === ".pdf" && auth) {
    const pdfUrl = URL.createObjectURL(file);
    try {
      const [upload, pageCount] = await Promise.allSettled([
        uploadSource(file, extension, auth, callbacks?.onUploadProgress),
        import("@/app/_infrastructure/browser/pdf-document").then(({ getPdfPageCount }) => getPdfPageCount(pdfUrl)),
      ]);
      if (upload.status === "fulfilled") sourcePath = upload.value;
      if (upload.status === "rejected") throw upload.reason;
      if (pageCount.status === "rejected") throw pageCount.reason;
      callbacks?.onMeta?.(pageCount.value);
      const slides = createPdfSlides(pageCount.value, pdfUrl);
      slides.forEach((slide) => callbacks?.onSlide?.(slide, slides.length));
      return { slides, sourcePath };
    } catch (error) {
      URL.revokeObjectURL(pdfUrl);
      if (sourcePath) await removeSource(sourcePath);
      throw error;
    }
  }

  try {
    if (auth) sourcePath = await uploadSource(file, extension, auth, callbacks?.onUploadProgress);

    const converted = await new Promise<Slide[]>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/convert");
      if (auth) {
        xhr.setRequestHeader("Authorization", `Bearer ${auth.accessToken}`);
        xhr.setRequestHeader("Content-Type", "application/json");
      } else {
        xhr.setRequestHeader("Content-Type", SOURCE_CONTENT_TYPES[extension]);
        xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
      }

      const slides: Slide[] = [];
      let total = 0;
      let consumed = 0;
      let streamError: string | null = null;
      let done = false;

      // 완성된 줄만 파싱하고, 잘린 마지막 줄은 다음 progress 까지 남겨둔다.
      const pump = () => {
        const text = xhr.responseText;
        let newline: number;
        while ((newline = text.indexOf("\n", consumed)) !== -1) {
          const line = text.slice(consumed, newline).trim();
          consumed = newline + 1;
          if (!line) continue;
          let event: ConvertEvent;
          try { event = JSON.parse(line) as ConvertEvent; } catch { continue; }
          if (event.type === "meta") { total = event.total || 0; callbacks?.onMeta?.(total); }
          else if (event.type === "slide") { slides.push(event.slide); callbacks?.onSlide?.(event.slide, total); }
          else if (event.type === "done") { done = true; }
          else if (event.type === "error") { streamError = event.error || "슬라이드 변환에 실패했습니다."; }
        }
      };

      if (!auth) xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) callbacks?.onUploadProgress?.(event.loaded / event.total);
      };
      if (auth) xhr.onprogress = () => { if (xhr.status === 200) pump(); };

      xhr.onload = () => {
        if (auth && xhr.status === 200) {
          pump();
          if (streamError) return reject(new Error(streamError));
          if (!done) return reject(new Error("변환이 도중에 끊겼어요. 다시 시도해 주세요."));
          resolve(slides.sort((a, b) => a.pageIndex - b.pageIndex));
          return;
        }
        if (!auth && xhr.status >= 200 && xhr.status < 300) {
          try { return resolve((JSON.parse(xhr.responseText) as { slides: Slide[] }).slides); }
          catch { return reject(new Error("서버 응답을 해석하지 못했습니다.")); }
        }
        let message = "슬라이드 변환에 실패했습니다.";
        try { message = (JSON.parse(xhr.responseText) as { error?: string }).error || message; } catch { /* 본문이 JSON 이 아니면 기본 메시지 */ }
        reject(new Error(message));
      };
      xhr.onerror = () => reject(new Error("네트워크 오류로 업로드에 실패했습니다."));
      xhr.send(auth ? JSON.stringify({ sourcePath, fileName: file.name }) : file);
    });
    return { slides: converted, sourcePath };
  } catch (error) {
    if (sourcePath) await removeSource(sourcePath);
    throw error;
  }
}
