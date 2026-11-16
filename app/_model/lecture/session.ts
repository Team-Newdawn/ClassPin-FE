import {
  isQuestionMarker,
  normalizeQuestionCategorySettings,
  type ClassSession
} from "../types.ts";

export const serializeSessionsForFailureCache = (sessions: ClassSession[]) =>
  JSON.stringify(sessions, (key, value) => key === "speakerNote" ? undefined : value);

export function normalizeSessions(sessions: ClassSession[]) {
  const seen = new Set<string>();
  const normalized = sessions.map((session) => {
    const folderId = session.folderId ?? null;
    const presentationInteractions = session.presentationInteractions ?? true;
    const presentationAutoplay = session.presentationAutoplay ?? false;
    const showQuestionPins = session.showQuestionPins ?? true;
    const showPresentationQr = session.showPresentationQr ?? true;
    const presentationQrPosition = session.presentationQrPosition ?? "bottom-right";
    const allowQuestionReactions = session.allowQuestionReactions ?? true;
    const allowEmojiReactions = session.allowEmojiReactions ?? true;
    const normalizedCategories = normalizeQuestionCategorySettings(session.questionCategories);
    const questionCategories = JSON.stringify(normalizedCategories) === JSON.stringify(session.questionCategories)
      ? session.questionCategories
      : normalizedCategories;
    const questions = session.questions.map((question) => {
      const isMine = question.isMine ?? true;
      const reactionCount = Math.max(0, question.reactionCount ?? 0);
      const reactedByMe = question.reactedByMe ?? false;
      const marker = isQuestionMarker(question.marker) ? question.marker : "pin";
      return isMine === question.isMine && reactionCount === question.reactionCount && reactedByMe === question.reactedByMe && marker === question.marker
        ? question
        : { ...question, isMine, reactionCount, reactedByMe, marker };
    });
    return folderId === session.folderId
      && presentationInteractions === session.presentationInteractions
      && presentationAutoplay === session.presentationAutoplay
      && showQuestionPins === session.showQuestionPins
      && showPresentationQr === session.showPresentationQr
      && presentationQrPosition === session.presentationQrPosition
      && allowQuestionReactions === session.allowQuestionReactions
      && allowEmojiReactions === session.allowEmojiReactions
      && questionCategories === session.questionCategories
      && questions.every((question, index) => question === session.questions[index])
      ? session
      : { ...session, folderId, presentationInteractions, presentationAutoplay, showQuestionPins, showPresentationQr, presentationQrPosition, allowQuestionReactions, allowEmojiReactions, questionCategories, questions };
  });
  const unique = normalized.filter((session) => {
    if (seen.has(session.id)) return false;
    seen.add(session.id);
    return true;
  });
  return unique.length === sessions.length && normalized.every((session, index) => session === sessions[index])
    ? sessions
    : unique;
}

/** 경과 밀리초를 00:05, 1:02:03 처럼 표시한다. 시계 차이로 음수가 오면 0으로 본다. */
export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(total / 3600);
  const clock = `${pad(Math.floor(total % 3600 / 60))}:${pad(total % 60)}`;
  return hours ? `${hours}:${clock}` : clock;
}
