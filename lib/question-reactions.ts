import type { Question } from "./types.ts";

export const withQuestionReaction = (question: Question, reactedByMe: boolean): Question =>
  question.reactedByMe === reactedByMe ? question : {
    ...question,
    reactedByMe,
    reactionCount: Math.max(0, question.reactionCount + (reactedByMe ? 1 : -1)),
  };

export const questionsByEmpathy = (questions: readonly Question[]) => [...questions].sort((left, right) =>
  right.reactionCount - left.reactionCount
  || right.createdAt.localeCompare(left.createdAt)
  || left.id.localeCompare(right.id)
);
