/** Runs at most `n` tasks at once; the rest wait in arrival order. */
export const limiter = (n: number) => {
  let free = n;
  const waiting: (() => void)[] = [];
  return async <T,>(task: () => Promise<T>) => {
    if (free) free--; else await new Promise<void>((resolve) => waiting.push(resolve));
    try { return await task(); } finally { const next = waiting.shift(); if (next) next(); else free++; }
  };
};
