import { describe, expect, it, vi } from 'vitest';

import { VERSION_HEADER as WORKER_VERSION_HEADER } from '../src/evidence-feed';
import { ATTEMPTS, ORIGIN, RETRY_MS, VERSION_HEADER, render, smoke } from './smoke';

const BASE = 'https://blueprint-evidence-feed.example.workers.dev';

const discussion = (number: number) => ({
  number,
  title: `Case ${number}`,
  preview: ['a', 'b', 'c'],
  url: `https://github.com/taco3064/blueprint/discussions/${number}`,
  createdAt: '2026-09-18T00:00:00Z',
  updatedAt: '2026-09-18T00:00:00Z',
});

interface Worker {
  probe?: () => Promise<Response>;
  feed?: () => Promise<Response>;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const granted = { 'Access-Control-Allow-Origin': ORIGIN };

function worker({ probe, feed }: Worker = {}) {
  const fetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => String(url).includes('?')
    ? (probe?.() ?? json({ error: 'Query parameters are not accepted.' }, 400))
    : (feed?.() ?? json({ discussions: [discussion(9), discussion(4)] }, 200, granted)));

  const wait = vi.fn(async () => {});

  return { fetch: fetch as unknown as typeof globalThis.fetch, calls: fetch.mock.calls, wait };
}

describe('smoke', () => {
  it('passes a live Worker serving the Discussion feed to the docs origin', async () => {
    const { fetch, calls, wait } = worker();

    expect(await smoke(BASE, { fetch, wait })).toEqual({
      served: ['#9 Case 9', '#4 Case 4'],
      problems: [],
    });

    expect(calls.map(([url]) => String(url)))
      .toEqual([`${BASE}/discussions?deploy-check`, `${BASE}/discussions`]);

    expect(new Headers(calls[1][1]?.headers).get('Origin')).toBe(ORIGIN);
    expect(wait).not.toHaveBeenCalled();
  });

  it('passes an empty feed', async () => {
    const { fetch, wait } = worker({ feed: async () => json({ discussions: [] }, 200, granted) });

    expect(await smoke(BASE, { fetch, wait })).toEqual({ served: [], problems: [] });
  });

  it('waits for the new version before reading the feed', async () => {
    const answers = [
      () => Promise.reject(new TypeError('fetch failed')),
      async () => json({ error: 'Not found.' }, 404),
      async () => json({ error: 'Query parameters are not accepted.' }, 400),
    ];

    const { fetch, calls, wait } = worker({ probe: () => answers.shift()!() });

    expect((await smoke(BASE, { fetch, wait })).problems).toEqual([]);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(RETRY_MS);
    expect(calls).toHaveLength(4);
  });

  it('gives up when the deployed version never answers', async () => {
    const { fetch, calls, wait } = worker({ probe: async () => json({ discussions: [] }) });
    const result = await smoke(BASE, { fetch, wait, attempts: 3 });

    expect(result.problems).toEqual([
      `${BASE}/discussions never answered its query-string probe with 400 from any version, so the deployment is not serving there.`,
    ]);

    expect(calls).toHaveLength(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  describe('with the deployed version', () => {
    const VERSION = 'aaaaaaaa-0000-0000-0000-000000000002';
    const from = (version: string) => ({ [VERSION_HEADER]: version });

    it('reads the Worker\x27s own version header', () => {
      expect(VERSION_HEADER).toBe(WORKER_VERSION_HEADER);
    });

    it('waits while the previous version still answers', async () => {
      const answers = [
        async () => json({}, 400, from('aaaaaaaa-0000-0000-0000-000000000001')),
        async () => json({}, 400),
        async () => json({}, 400, from(VERSION)),
      ];

      const { fetch, wait } = worker({
        probe: () => answers.shift()!(),
        feed: async () => json(
          { discussions: [discussion(1)] }, 200, { ...granted, ...from(VERSION) },
        ),
      });

      expect(await smoke(BASE, { fetch, wait, version: VERSION })).toEqual({ served: ['#1 Case 1'], problems: [] });
      expect(wait).toHaveBeenCalledTimes(2);
    });

    it('fails when only the previous version ever answers', async () => {
      const { fetch, calls, wait } = worker({
        probe: async () => json({}, 400, from('aaaaaaaa-0000-0000-0000-000000000001')),
      });

      expect((await smoke(BASE, { fetch, wait, attempts: 2, version: VERSION })).problems).toEqual([
        `${BASE}/discussions never answered its query-string probe with 400 from version ${VERSION}, so the deployment is not serving there.`,
      ]);

      expect(calls).toHaveLength(2);
    });

    it('fails a feed answered by another version', async () => {
      const { fetch, wait } = worker({
        probe: async () => json({}, 400, from(VERSION)),
        feed: async () => json({ discussions: [discussion(1)] }, 200, { ...granted, ...from('old') }),
      });

      expect((await smoke(BASE, { fetch, wait, version: VERSION })).problems)
        .toEqual([`GET /discussions answered from old, not ${VERSION}.`]);
    });
  });

  it('allows a minute for a first deployment to become reachable', () => {
    expect(ATTEMPTS * RETRY_MS).toBe(60000);
  });

  it('names the missing key when the feed answers 502', async () => {
    const { fetch, wait } = worker({ feed: async () => json({ error: 'Live evidence is unavailable.' }, 502, granted) });
    const { problems } = await smoke(BASE, { fetch, wait });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('GET /discussions answered 502.');
    expect(problems[0]).toContain('GITHUB_PRIVATE_KEY');
    expect(problems[0]).toContain('npx wrangler tail');
  });

  it.each([
    ['a non-JSON body', async () => new Response('<html>', { status: 200 })],
    ['no discussions list', async () => json({}, 200, granted)],
    ['an entry without a title', async () => json({ discussions: [{ ...discussion(1), title: 7 }] }, 200, granted)],
    ['an entry without a preview', async () => json({ discussions: [{ ...discussion(1), preview: 'a' }] }, 200, granted)],
    ['a foreign URL', async () => json({ discussions: [{ ...discussion(1), url: 'https://evil.example/1' }] }, 200, granted)],
    ['a fractional number', async () => json({ discussions: [{ ...discussion(1), number: 1.5 }] }, 200, granted)],
    ['a null entry', async () => json({ discussions: [null] }, 200, granted)],
  ])('fails on %s', async (_label, feed) => {
    const { fetch, wait } = worker({ feed });

    expect((await smoke(BASE, { fetch, wait })).problems)
      .toEqual(['GET /discussions answered 200 without a Discussion feed.']);
  });

  it('fails when the docs origin is not granted browser access', async () => {
    const { fetch, wait } = worker({ feed: async () => json({ discussions: [discussion(1)] }) });

    expect(await smoke(BASE, { fetch, wait })).toEqual({
      served: ['#1 Case 1'],
      problems: [`GET /discussions did not grant ${ORIGIN} browser access.`],
    });
  });

  it('reports a feed request that fails outright', async () => {
    const { fetch, wait } = worker({
      feed: () => Promise.reject(new TypeError('fetch failed')),
    });

    expect((await smoke(BASE, { fetch, wait })).problems)
      .toEqual(['GET /discussions failed: TypeError: fetch failed']);
  });

  it.each(['', 'blueprint-evidence-feed.example.workers.dev', `${BASE}/`, `${BASE}/discussions`])(
    'refuses %j as the Worker origin without a request',
    async (base) => {
      const { fetch, calls, wait } = worker();

      expect((await smoke(base, { fetch, wait })).problems)
        .toEqual([`"${base}" is not a Worker origin URL.`]);

      expect(calls).toEqual([]);
    },
  );

  it('uses the runtime fetch and a real delay by default', async () => {
    vi.useFakeTimers();

    const { fetch } = worker({
      probe: vi.fn()
        .mockResolvedValueOnce(json({}, 404))
        .mockResolvedValueOnce(json({}, 400)),
    });

    vi.stubGlobal('fetch', fetch);

    try {
      const pending = smoke(BASE);

      await vi.advanceTimersByTimeAsync(RETRY_MS);

      expect((await pending).problems).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

describe('render', () => {
  it('lists the served Discussions for the step summary', () => {
    expect(render(BASE, { served: ['#9 Case 9', '#4 Case 4'], problems: [] })).toBe([
      `### Evidence feed: ${BASE}/discussions`,
      '',
      '**Discussions served: 2**',
      '',
      '- #9 Case 9',
      '- #4 Case 4',
    ].join('\n'));
  });

  it('lists every problem under a failure heading', () => {
    expect(render(BASE, { served: ['#1 Case 1'], problems: ['one', 'two'] })).toBe([
      `### Evidence feed: ${BASE}/discussions`,
      '',
      '**Failed**',
      '',
      '- #1 Case 1',
      '- one',
      '- two',
    ].join('\n'));
  });
});
