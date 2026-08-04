export const shuffle = <T>(values: readonly T[], random = Math.random) => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

export function reconcileFeedbackRotation({ previousIds, visibleIds, currentId, random = Math.random }: {
  previousIds: readonly string[];
  visibleIds: readonly string[];
  currentId: string | null;
  random?: () => number;
}) {
  const previous = new Set(previousIds);
  const incomingId = shuffle(visibleIds.filter((id) => !previous.has(id)), random)[0];

  // 새 태그를 활성화해 지도 하이라이트와 하단 설명 카드가 같은 의견을 즉시 보여준다.
  if (incomingId) {
    return {
      activeId: incomingId,
      queue: shuffle(visibleIds.filter((id) => id !== incomingId), random)
    };
  }

  const currentStillVisible = currentId ? visibleIds.includes(currentId) : false;
  const randomized = shuffle(visibleIds.filter((id) => id !== currentId), random);
  if (currentStillVisible) return { activeId: currentId, queue: randomized };

  const activeId = randomized.shift() ?? visibleIds[0] ?? null;
  return { activeId, queue: randomized.filter((id) => id !== activeId) };
}
