"use client";

import { useSessions } from "./session-store";

/** 발표 PC와 모바일 리모컨이 같은 강의 설정을 사용한다. */
export function usePinLabelMode(sessionId: string | undefined) {
  const { sessions, setShowQuestionLabels } = useSessions();
  const session = sessions.find((item) => item.id === sessionId);
  return [session?.showQuestionLabels ?? false, (visible: boolean) => sessionId
    ? setShowQuestionLabels(sessionId, visible)
    : Promise.resolve()] as const;
}
