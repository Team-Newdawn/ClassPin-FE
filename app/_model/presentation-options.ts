import type { ClassSession, PresentationQrPosition } from "./types.ts";

export const QR_POSITIONS = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"] as const;
export type QrPosition = typeof QR_POSITIONS[number];
export type QuestionDisplayMode = "off" | "pins" | "questions" | "bubbles";
export type PresentationOptions = {
  qrPosition?: QrPosition;
  qrBasePosition?: PresentationQrPosition;
  qrSize?: number;
  qrEditable?: boolean;
  qrOffset?: { x: number; y: number } | null;
  questionBubbles?: boolean;
};

export const clampQrSize = (size: number) => Math.round(Math.min(160, Math.max(64, Number.isFinite(size) ? size : 96)));

export function presentationOptions(session: ClassSession | undefined, saved: Partial<PresentationOptions>) {
  const position = saved.qrBasePosition === session?.presentationQrPosition && QR_POSITIONS.includes(saved.qrPosition as QrPosition)
    ? saved.qrPosition! : session?.presentationQrPosition ?? "bottom-right";
  const offset = saved.qrBasePosition === session?.presentationQrPosition ? saved.qrOffset : null;
  return {
    qrPosition: position,
    qrSize: clampQrSize(saved.qrSize ?? 96),
    qrEditable: saved.qrEditable === true,
    qrOffset: offset && Number.isFinite(offset.x) && Number.isFinite(offset.y)
      ? { x: Math.min(1, Math.max(0, offset.x)), y: Math.min(1, Math.max(0, offset.y)) } : null,
    questionMode: (!session?.showQuestionPins ? "off" : !session.showQuestionLabels ? "pins" : saved.questionBubbles === true ? "bubbles" : "questions") as QuestionDisplayMode
  };
}
