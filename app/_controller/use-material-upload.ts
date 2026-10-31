"use client";

import { useRef, useState } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import { useSessions } from "@/app/_controller/session-store";
import { localizeUploadError } from "@/app/_model/i18n";
import { convertToSlides } from "@/app/_service/convert";

type UploadItem = { id: string; file: File; phase: "waiting" | "uploading" | "processing" | "done" | "failed"; progress: number; error?: string; slideCount?: number };

/** Upload queue for `MaterialUploadDialog`: files convert one at a time, each becomes a material in the chosen folder. */
export function useMaterialUpload(folderId: string | null) {
  const { t, locale } = useLanguage();
  const { folders, createSession } = useSessions();
  const [targetFolder, setTargetFolder] = useState(folderId);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);

  const upload = async (files: File[], retryId?: string) => {
    if (active.current || !files.length) return;
    active.current = true;
    setBusy(true);
    const pending: UploadItem[] = files.map((file) => ({ id: crypto.randomUUID(), file, phase: "waiting", progress: 0 }));
    setItems((previous) => [...previous.filter((item) => item.id !== retryId), ...pending]);
    const update = (id: string, changes: Partial<UploadItem>) => setItems((previous) => previous.map((item) => item.id === id ? { ...item, ...changes } : item));
    try {
      for (const item of pending) {
        update(item.id, { phase: "uploading" });
        try {
          const result = await convertToSlides(item.file, {
            onUploadProgress: (fraction) => update(item.id, { progress: Math.round(fraction * 100), phase: fraction >= 1 ? "processing" : "uploading" }),
            onMeta: () => update(item.id, { phase: "processing" }),
          });
          await createSession({ folderId: targetFolder, title: item.file.name.replace(/\.(pdf|pptx?)$/i, ""), fileName: item.file.name, slides: result.slides, sourcePath: result.sourcePath });
          update(item.id, { phase: "done", progress: 100, slideCount: result.slides.length });
        } catch (error) {
          update(item.id, { phase: "failed", error: error instanceof Error ? localizeUploadError(locale, error.message) : t("upload.failed") });
        }
      }
    } finally { active.current = false; setBusy(false); }
  };

  return { folders, targetFolder, setTargetFolder, items, hide: (id: string) => setItems((previous) => previous.filter((row) => row.id !== id)), busy, upload };
}
