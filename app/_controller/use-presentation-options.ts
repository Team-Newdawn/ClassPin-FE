"use client";

import type { ClassSession } from "../_model/types";
import { presentationOptions, type PresentationOptions } from "../_model/presentation-options";
import { useBrowserPreferences } from "./use-browser-preferences";

export function usePresentationOptions(session: ClassSession | undefined) {
  const [saved, update] = useBrowserPreferences<PresentationOptions>(`presentation:${session?.id ?? ""}`);
  const options = presentationOptions(session, saved);
  return [options, (patch: Partial<PresentationOptions>) => update({ qrPosition: options.qrPosition, qrBasePosition: session?.presentationQrPosition, qrOffset: options.qrOffset, ...patch })] as const;
}
