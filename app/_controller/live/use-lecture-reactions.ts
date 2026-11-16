"use client";

import { useRealtimeReactions } from "@/app/_controller/live/use-realtime-reactions";
import {
  LECTURE_QUESTIONS_CHANGED_EVENT,
  LECTURE_REACTION_EMOJIS,
  LECTURE_REACTION_EVENT,
  lectureReactionTopic
} from "@/app/_model/lecture/lecture-reactions";

export function useLectureReactions(lectureId: string | null, onQuestionsChanged?: (lectureId: string) => void) {
  return useRealtimeReactions({
    scopeId: lectureId,
    topic: lectureId ? lectureReactionTopic(lectureId) : null,
    event: LECTURE_REACTION_EVENT,
    allowedEmojis: LECTURE_REACTION_EMOJIS,
    errorLabel: "Lecture reaction",
    signalEvent: LECTURE_QUESTIONS_CHANGED_EVENT,
    onSignal: onQuestionsChanged
  });
}
