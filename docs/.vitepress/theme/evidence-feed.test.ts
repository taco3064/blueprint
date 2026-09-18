import { describe, expect, it, vi } from 'vitest';

import {
  DISCUSSIONS_URL,
  EVIDENCE_FEED_URL,
  FEED_TIMEOUT_MS,
  feedUrl,
  formatDate,
  loadEvidence,
  parseFeed,
  type EvidenceItem,
} from './evidence-feed';

const FEED = 'https://blueprint-evidence-feed.example.workers.dev/discussions';

const item = (number: number, overrides: Record<string, unknown> = {}): EvidenceItem => ({
  number,
  title: `Case ${number}`,
  preview: ['one', 'two', 'three'],
  url: `https://github.com/taco3064/blueprint/discussions/${number}`,
  createdAt: '2026-09-16T00:47:38Z',
  updatedAt: '2026-09-17T00:00:00Z',
  ...overrides,
} as EvidenceItem);

const respond = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('feedUrl', () => {
  it('uses a build-time override, such as a local wrangler dev Worker', () => {
    expect(feedUrl('http://localhost:8787/discussions')).toBe('http://localhost:8787/discussions');
  });

  it('falls back to the production Worker', () => {
    expect(EVIDENCE_FEED_URL).toBe('https://blueprint-evidence-feed.tabacotaco.workers.dev/discussions');
    expect(feedUrl(undefined)).toBe(EVIDENCE_FEED_URL);
    expect(feedUrl('')).toBe(EVIDENCE_FEED_URL);
  });

  it('links every fallback to the repository Discussions', () => {
    expect(DISCUSSIONS_URL).toBe('https://github.com/taco3064/blueprint/discussions');
  });
});

describe('parseFeed', () => {
  it('keeps the Worker order and every entry', () => {
    expect(parseFeed({ discussions: [item(9), item(5), item(2)] })?.map((entry) => entry.number))
      .toEqual([9, 5, 2]);
  });

  it('accepts an empty feed', () => {
    expect(parseFeed({ discussions: [] })).toEqual([]);
  });

  it.each([
    ['null', null],
    ['a string', 'discussions'],
    ['no discussions list', {}],
    ['a non-list', { discussions: {} }],
    ['a null entry', { discussions: [null] }],
    ['a primitive entry', { discussions: [7] }],
  ])('rejects %s', (_label, payload) => {
    expect(parseFeed(payload)).toBeNull();
  });

  it.each([
    ['a fractional number', { number: 1.5 }],
    ['a missing title', { title: undefined }],
    ['a preview that is not a list', { preview: 'one' }],
    ['a non-text preview line', { preview: ['one', 2] }],
    ['a script URL', { url: 'javascript:alert(1)' }],
    ['another repository', { url: 'https://github.com/someone/else/discussions/1' }],
    ['a look-alike host', { url: 'https://github.com.evil.example/taco3064/blueprint/discussions/1' }],
    ['a trailing path', { url: 'https://github.com/taco3064/blueprint/discussions/1/evil' }],
    ['a missing URL', { url: undefined }],
    ['an unparseable creation date', { createdAt: 'yesterday' }],
    ['a missing creation date', { createdAt: undefined }],
    ['a missing update date', { updatedAt: undefined }],
  ])('rejects a whole feed containing %s', (_label, overrides) => {
    expect(parseFeed({ discussions: [item(1), item(2, overrides)] })).toBeNull();
  });
});

describe('loadEvidence', () => {
  it('is ready with the Worker entries', async () => {
    const fetch = respond({ discussions: [item(2), item(1)] });
    const state = await loadEvidence(FEED, { fetch });

    expect(state).toEqual({ status: 'ready', items: [item(2), item(1)] });
    expect(fetch).toHaveBeenCalledWith(FEED, expect.objectContaining({ credentials: 'omit' }));
  });

  it('sends no credentials or custom headers, so the browser needs no preflight', async () => {
    const fetch = respond({ discussions: [] });

    await loadEvidence(FEED, { fetch });

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];

    expect(Object.keys(init).sort()).toEqual(['credentials', 'signal']);
  });

  it('is empty when no Discussion is published', async () => {
    expect(await loadEvidence(FEED, { fetch: respond({ discussions: [] }) })).toEqual({ status: 'empty' });
  });

  it.each([
    ['a Worker error', respond({ error: 'Live evidence is unavailable.' }, 502)],
    ['a Free-plan limit page', vi.fn(async () => new Response('error code: 1027', { status: 429 }))],
    ['a success that is not JSON', vi.fn(async () => new Response('<html>'))],
    ['a malformed feed', respond({ discussions: [{ number: 1 }] })],
    ['a network or CORS failure', vi.fn(async () => { throw new TypeError('Failed to fetch'); })],
  ])('is unavailable on %s, after exactly one request', async (_label, fetch) => {
    expect(await loadEvidence(FEED, { fetch })).toEqual({ status: 'unavailable' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('gives up on a Worker that never answers', async () => {
    const fetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
    }));

    expect(await loadEvidence(FEED, { fetch, timeoutMs: 5 })).toEqual({ status: 'unavailable' });
    expect(FEED_TIMEOUT_MS).toBe(8000);
  });

  it('uses the browser fetch by default', async () => {
    const fetch = respond({ discussions: [item(1)] });

    vi.stubGlobal('fetch', fetch);

    try {
      expect(await loadEvidence(FEED)).toEqual({ status: 'ready', items: [item(1)] });
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('formatDate', () => {
  it('formats the creation date for each homepage locale', () => {
    expect(formatDate('2026-09-16T00:47:38Z', 'en-US', 'UTC')).toBe('Sep 16, 2026');
    expect(formatDate('2026-09-16T00:47:38Z', 'zh-TW', 'UTC')).toBe('2026年9月16日');
  });

  it('uses the reader time zone', () => {
    expect(formatDate('2026-09-16T00:47:38Z', 'en-US', 'America/Los_Angeles')).toBe('Sep 15, 2026');
  });
});
