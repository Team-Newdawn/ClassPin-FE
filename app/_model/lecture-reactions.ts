export const LECTURE_REACTION_EVENT = "emoji";
/** 참여자가 질문을 제출한 뒤 같은 토픽으로 보내는 재조회 신호. payload 는 쓰지 않는다. */
export const LECTURE_QUESTIONS_CHANGED_EVENT = "questions-changed";
export const LECTURE_REACTION_EMOJIS = ["👍", "❓", "💡", "🙁"] as const;

export type LectureReactionEmoji = (typeof LECTURE_REACTION_EMOJIS)[number];

export function lectureReactionTopic(lectureId: string) {
  return `lecture-reactions:${lectureId}`;
}
