export const timeAgo = (value: string) => {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}초 전`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  return `${Math.floor(seconds / 3600)}시간 전`;
};

export const categoryLabel = {
  concept: "개념 질문",
  why: "왜 그런가요?",
  example: "예시 요청",
  error: "오류 제보",
  important: "중요해요"
} as const;
