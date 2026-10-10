/**
 * 재조회를 한 번에 하나만 실행한다. 실행 중 들어온 요청은 끝난 뒤 한 번으로 합치고,
 * 전체 재조회(full) 요청이 하나라도 섞이면 합친 요청도 전체로 올린다.
 */
export function coalesceRefresh(run: (full: boolean) => Promise<unknown>) {
  let running = false;
  let queued: boolean | null = null;
  const request = (full: boolean) => {
    if (running) {
      queued = queued || full;
      return;
    }
    running = true;
    const done = () => {
      running = false;
      if (queued === null) return;
      const next = queued;
      queued = null;
      request(next);
    };
    void run(full).then(done, done);
  };
  return request;
}
