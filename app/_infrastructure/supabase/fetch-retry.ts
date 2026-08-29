const MAX_ABORTED_TRANSACTION_RETRIES = 2;

/** 실패 상태로 남은 PostgREST 연결이 반환하는 25P02만 짧게 재시도한다. */
export const fetchWithAbortedTransactionRetry: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input.clone() : input;

  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(request instanceof Request ? request.clone() : request, init);
    const error = response.status === 500
      ? await response.clone().json().catch(() => null) as { code?: unknown } | null
      : null;
    if (error?.code !== "25P02" || attempt >= MAX_ABORTED_TRANSACTION_RETRIES) return response;
    await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
};
