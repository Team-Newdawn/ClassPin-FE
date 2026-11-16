export const LECTURE_REACTION_EVENT = "emoji";
/** 참여자가 질문을 제출한 뒤 같은 토픽으로 보내는 재조회 신호. payload 는 쓰지 않는다. */
export const LECTURE_QUESTIONS_CHANGED_EVENT = "questions-changed";
export const LECTURE_REACTION_EMOJIS = ["👍", "❓", "💡", "🙁"] as const;

export type LectureReactionEmoji = (typeof LECTURE_REACTION_EMOJIS)[number];

export function lectureReactionTopic(lectureId: string) {
  return `lecture-reactions:${lectureId}`;
}

/** 참여자 탭이 보내는 "보고 있음" 신호. 강사 작업 공간만 이 토픽을 구독하므로 참여자 사이에 퍼지지 않는다. */
export const LECTURE_AUDIENCE_EVENT = "here";

export function lectureAudienceTopic(lectureId: string) {
  return `lecture-audience:${lectureId}`;
}
