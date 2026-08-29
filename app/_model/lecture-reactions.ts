export const LECTURE_REACTION_EVENT = "emoji";
export const LECTURE_REACTION_EMOJIS = ["👍", "❓", "💡", "🙁"] as const;

export type LectureReactionEmoji = (typeof LECTURE_REACTION_EMOJIS)[number];

export function lectureReactionTopic(lectureId: string) {
  return `lecture-reactions:${lectureId}`;
}
