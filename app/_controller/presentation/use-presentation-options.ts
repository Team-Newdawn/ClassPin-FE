"use client";

import type { ClassSession } from "../_model/types";
import { presentationOptions, type PresentationOptions } from "../_model/presentation-options";
import { useBrowserPreferences } from "./use-browser-preferences";
import { useSessions } from "./session-store";

export function usePresentationOptions(session: ClassSession | undefined) {
  const [saved, update] = useBrowserPreferences<PresentationOptions>(`presentation:${session?.id ?? ""}`);
  const { setPresentationOptions } = useSessions();
  const options = presentationOptions(session, saved);
  return [options, async (patch: Partial<PresentationOptions>) => {
    const next = { ...(session?.presentationOptions ?? saved), qrPosition: options.qrPosition, qrBasePosition: session?.presentationQrPosition, qrOffset: options.qrOffset, ...patch };
    if (session) await setPresentationOptions(session.id, next);
    update(next);
  }] as const;
}
