"use client";

import { useRealtimeReactions } from "@/components/use-realtime-reactions";
import {
  LECTURE_REACTION_EMOJIS,
  LECTURE_REACTION_EVENT,
  lectureReactionTopic
} from "@/lib/lecture-reactions";

export function useLectureReactions(lectureId: string | null) {
  return useRealtimeReactions({
    scopeId: lectureId,
    topic: lectureId ? lectureReactionTopic(lectureId) : null,
    event: LECTURE_REACTION_EVENT,
    allowedEmojis: LECTURE_REACTION_EMOJIS,
    errorLabel: "Lecture reaction"
  });
}
