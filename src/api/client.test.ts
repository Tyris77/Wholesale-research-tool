import { test, expect } from 'vitest';
import { apiFetch, ApiError } from './client';

function fakeFetch(body: unknown, { ok = true, status = 200 } = {}) {
  const calls: { url: string; options?: RequestInit }[] = [];
  const fn = (async (url: string, options?: RequestInit) => {
    calls.push({ url, options });
    return { ok, status, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch;
  return { fn, calls };
}

test('apiFetch builds the URL from base + path and parses JSON', async () => {
  const { fn, calls } = fakeFetch([{ id: '1' }]);
  const data = await apiFetch<{ id: string }[]>('/api/markets', undefined, fn, 'http://x');
  expect(calls[0].url).toBe('http://x/api/markets');
  expect(data[0].id).toBe('1');
});

test('apiFetch throws ApiError with details on a non-ok response', async () => {
  const { fn } = fakeFetch(
    { success: false, error: 'Validation failed', details: [{ path: 'name', message: 'Required' }] },
    { ok: false, status: 400 },
  );
  await expect(apiFetch('/api/sellers', { method: 'POST' }, fn, 'http://x')).rejects.toMatchObject({
    name: 'ApiError',
    status: 400,
    message: 'Validation failed',
  });
});

test('apiFetch sends a JSON content-type header', async () => {
  const { fn, calls } = fakeFetch({});
  await apiFetch('/api/health', undefined, fn, 'http://x');
  const headers = calls[0].options?.headers as Record<string, string>;
  expect(headers['Content-Type']).toBe('application/json');
});
