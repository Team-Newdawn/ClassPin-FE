import type { Question } from "./types.ts";

export const withQuestionReaction = (question: Question, reactedByMe: boolean): Question =>
  question.reactedByMe === reactedByMe ? question : {
    ...question,
    reactedByMe,
    reactionCount: Math.max(0, question.reactionCount + (reactedByMe ? 1 : -1)),
  };

const newestFirst = (left: Question, right: Question) =>
  right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id);

export const questionsByNewest = (questions: readonly Question[]) => [...questions].sort(newestFirst);

export const questionsByEmpathy = (questions: readonly Question[]) => [...questions].sort((left, right) =>
  right.reactionCount - left.reactionCount
  || newestFirst(left, right)
);
