import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T, A extends unknown[]> {
  data: T | null;
  loading: boolean;
  error: string | null;
  run: (...args: A) => Promise<T | undefined>;
  setData: (data: T | null) => void;
}

// Standardizes the loading/error/data lifecycle for an async function.
// Pass immediate=true to run once on mount (e.g. fetch-on-load views).
export function useAsync<T, A extends unknown[] = []>(
  fn: (...args: A) => Promise<T>,
  immediate = false,
): AsyncState<T, A> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (...args: A) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current(...args);
      setData(result);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (immediate) run(...([] as unknown as A));
  }, [immediate, run]);

  return { data, loading, error, run, setData };
}
