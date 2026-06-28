import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from '../src/index.js';

/** Mirrors the module-private DEFAULT_USER_AGENT in src/http.ts. */
const DEFAULT_UA = 'synfin-adapters/0.1.0 (+https://synfin.xyz)';

/**
 * `fetchJson` is the default live transport. These tests stub the global
 * `fetch` so the transport logic is exercised deterministically **without any
 * live network call** (TESTING.md: CI makes no live calls).
 */

interface FakeResponse {
  status: number;
  text: () => Promise<string>;
}
function stubFetch(response: FakeResponse): {
  calls: Array<{ url: string; init: Record<string, unknown> }>;
} {
  const calls: Array<{ url: string; init: Record<string, unknown> }> = [];
  vi.stubGlobal('fetch', (url: string, init: Record<string, unknown>) => {
    calls.push({ url, init });
    return Promise.resolve(response);
  });
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchJson', () => {
  it('parses a JSON body on success', async () => {
    stubFetch({ status: 200, text: () => Promise.resolve('{"a":1}') });
    const res = await fetchJson()({
      url: 'https://x.invalid/q',
      method: 'GET',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ a: 1 });
  });

  it('returns raw text when the body is not JSON', async () => {
    stubFetch({ status: 200, text: () => Promise.resolve('not json') });
    const res = await fetchJson()({
      url: 'https://x.invalid/q',
      method: 'GET',
    });
    expect(res.body).toBe('not json');
  });

  it('returns undefined body for an empty response', async () => {
    stubFetch({ status: 204, text: () => Promise.resolve('') });
    const res = await fetchJson()({
      url: 'https://x.invalid/q',
      method: 'GET',
    });
    expect(res.body).toBeUndefined();
  });

  it('sends a JSON body and content-type on POST, and merges custom headers', async () => {
    const { calls } = stubFetch({
      status: 200,
      text: () => Promise.resolve('{}'),
    });
    await fetchJson()({
      url: 'https://x.invalid/q',
      method: 'POST',
      headers: { authorization: 'Bearer k' },
      body: { hello: 'world' },
    });
    expect(calls).toHaveLength(1);
    const init = calls[0]!.init;
    expect(init['method']).toBe('POST');
    expect(init['body']).toBe('{"hello":"world"}');
    const headers = init['headers'] as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['authorization']).toBe('Bearer k');
    // The default UA and accept are present alongside a body and custom headers.
    expect(headers['accept']).toBe('application/json');
    expect(headers['user-agent']).toBe(DEFAULT_UA);
  });

  it('sends a default honest user-agent when the request sets no headers', async () => {
    const { calls } = stubFetch({
      status: 200,
      text: () => Promise.resolve('{}'),
    });
    await fetchJson()({ url: 'https://x.invalid/q', method: 'GET' });
    const headers = calls[0]!.init['headers'] as Record<string, string>;
    expect(headers['user-agent']).toBe(DEFAULT_UA);
    expect(headers['user-agent']).not.toBe('');
    // The default does not clobber accept, and there is no body, so no content-type.
    expect(headers['accept']).toBe('application/json');
    expect(headers['content-type']).toBeUndefined();
  });

  it('lets a caller override the default user-agent via request headers', async () => {
    const { calls } = stubFetch({
      status: 200,
      text: () => Promise.resolve('{}'),
    });
    await fetchJson()({
      url: 'https://x.invalid/q',
      method: 'GET',
      headers: { 'user-agent': 'custom/1.0' },
    });
    const headers = calls[0]!.init['headers'] as Record<string, string>;
    expect(headers['user-agent']).toBe('custom/1.0');
  });

  it('propagates a transport error as a rejected promise', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network down')));
    await expect(
      fetchJson()({ url: 'https://x.invalid/q', method: 'GET' }),
    ).rejects.toThrow(/network down/);
  });
});
