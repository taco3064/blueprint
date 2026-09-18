import { generateKeyPairSync } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ALLOWED_ORIGINS,
  CACHE_KEY_HEADERS,
  FAILURE_CACHE,
  FEED_PATH,
  FRESH_CACHE,
  UNAVAILABLE,
  gitHubApp,
  handleRequest,
  type Env,
} from './evidence-feed';
import type { Effects } from './github';

const PEM = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  .export({ type: 'pkcs1', format: 'pem' }).toString();

const TOKEN = 'ghs_installation-token';
const ENDPOINT = `https://blueprint-evidence-feed.example.workers.dev${FEED_PATH}`;
const PRODUCTION = 'https://taco3064.github.io';

const env: Env = {
  GITHUB_APP_ID: '123456',
  GITHUB_INSTALLATION_ID: '7890',
  GITHUB_PRIVATE_KEY: PEM,
  GITHUB_OWNER: 'taco3064',
  GITHUB_REPO: 'blueprint',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const discussion = (number: number, createdAt: string) => ({
  number,
  title: `Case ${number}`,
  bodyText: `Case ${number}\n\nline a\nline b\n\nline c\nline d`,
  url: `https://github.com/taco3064/blueprint/discussions/${number}`,
  createdAt,
  updatedAt: createdAt,
});

const PAGES = [
  { nodes: [discussion(2, '2026-09-10T00:00:00Z'), discussion(5, '2026-09-16T00:00:00Z')], pageInfo: { hasNextPage: true, endCursor: 'next' } },
  { nodes: [discussion(9, '2026-09-18T00:00:00Z')], pageInfo: { hasNextPage: false, endCursor: null } },
];

function github(overrides: Partial<Record<'token' | 'graphql', () => Response>> = {}) {
  const calls: string[] = [];

  const effects: Effects = {
    now: () => Date.UTC(2026, 8, 18),
    fetch: vi.fn(async (url: string, init: RequestInit) => {
      calls.push(url);

      if (url.endsWith('/access_tokens')) return overrides.token?.() ?? json({ token: TOKEN }, 201);

      const { cursor } = JSON.parse(String(init.body)).variables;

      return overrides.graphql?.()
        ?? json({ data: { repository: { discussions: PAGES[cursor === null ? 0 : 1] } } });
    }),
  };

  return { calls, effects };
}

const request = (init: RequestInit & { url?: string } = {}) =>
  new Request(init.url ?? ENDPOINT, init);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the feed', () => {
  it('returns every discussion across pages, newest first, as the public projection', async () => {
    const { effects } = github();

    const response = await handleRequest(
      request({ headers: { Origin: PRODUCTION } }), env, effects,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');

    expect(await response.json()).toEqual({
      discussions: [9, 5, 2].map((number) => ({
        number,
        title: `Case ${number}`,
        preview: ['line a', 'line b', 'line c'],
        url: `https://github.com/taco3064/blueprint/discussions/${number}`,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    });
  });

  it('caches a fresh feed for five minutes, per requesting origin', async () => {
    const response = await handleRequest(
      request({ headers: { Origin: PRODUCTION } }), env, github().effects,
    );

    expect(FRESH_CACHE).toBe('public, max-age=300');
    expect(response.headers.get('Cache-Control')).toBe(FRESH_CACHE);
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it.each(ALLOWED_ORIGINS)('lets %s read the feed', async (origin) => {
    const response = await handleRequest(
      request({ headers: { Origin: origin } }), env, github().effects,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('allows exactly the production docs origin and the docs dev server', () => {
    expect(ALLOWED_ORIGINS).toEqual(['https://taco3064.github.io', 'http://localhost:5173']);
  });

  it('serves a request without an Origin, such as curl, without a CORS grant', async () => {
    const response = await handleRequest(request(), env, github().effects);

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('answers HEAD, which shares the GET cache entry', async () => {
    const response = await handleRequest(
      request({ method: 'HEAD' }), env, github().effects,
    );

    expect(response.status).toBe(200);
  });

  it('never returns the token, the App JWT, or the private key', async () => {
    const { effects } = github();
    const body = await (await handleRequest(request(), env, effects)).text();
    const jwt = new Headers(vi.mocked(effects.fetch).mock.calls[0][1].headers).get('Authorization');

    expect(body).not.toContain(TOKEN);
    expect(body).not.toContain(jwt!.replace('Bearer ', ''));
    expect(body).not.toContain('PRIVATE KEY');
  });
});

describe('requests that must not reach GitHub', () => {
  it.each([
    ['/'],
    ['/discussions/'],
    ['/discussions/1'],
    ['/graphql'],
    ['/repos/taco3064/blueprint/discussions'],
    ['//discussions'],
    ['/%64iscussions'],
  ])('refuses the path %s', async (path) => {
    const { calls, effects } = github();

    const response = await handleRequest(
      request({ url: `https://feed.example.workers.dev${path}` }), env, effects,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(calls).toEqual([]);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('refuses %s', async (method) => {
    const { calls, effects } = github();

    const response = await handleRequest(
      request({ method, headers: { Origin: PRODUCTION } }), env, effects,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(calls).toEqual([]);
  });

  it.each([
    ['?'],
    ['?cache=bust'],
    ['?query={viewer{login}}'],
    ['?owner=someone&repo=else'],
  ])('refuses the query string %s, which would mint a fresh cache key', async (search) => {
    const { calls, effects } = github();

    const response = await handleRequest(
      request({ url: `${ENDPOINT}${search}` }), env, effects,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(calls).toEqual([]);
  });

  it.each(CACHE_KEY_HEADERS)('refuses the cache-key header %s', async (name) => {
    const { calls, effects } = github();

    const response = await handleRequest(
      request({ headers: { [name]: 'random' } }), env, effects,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(calls).toEqual([]);
  });

  it('names every header Workers Caching adds to its cache key', () => {
    expect(CACHE_KEY_HEADERS).toEqual([
      'x-http-method-override',
      'x-http-method',
      'x-method-override',
      'x-forwarded-host',
      'x-host',
      'x-original-url',
      'x-rewrite-url',
      'forwarded',
      'cloudflare-workers-version-key',
    ]);
  });

  it.each(['random', 'ftp', 'https2'])('refuses x-forwarded-scheme %s', async (scheme) => {
    const { calls, effects } = github();

    const response = await handleRequest(
      request({ headers: { 'x-forwarded-scheme': scheme } }), env, effects,
    );

    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it.each(['http', 'https', 'HTTPS'])('accepts x-forwarded-scheme %s, which stays out of the cache key', async (scheme) => {
    const response = await handleRequest(
      request({ headers: { 'x-forwarded-scheme': scheme } }), env, github().effects,
    );

    expect(response.status).toBe(200);
  });

  it.each([
    ['https://evil.example'],
    ['https://taco3064.github.io.evil.example'],
    ['http://taco3064.github.io'],
    ['http://localhost:4173'],
    ['null'],
  ])('refuses the origin %s', async (origin) => {
    const { calls, effects } = github();

    const response = await handleRequest(
      request({ headers: { Origin: origin } }), env, effects,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(calls).toEqual([]);
  });
});

describe('failures', () => {
  it.each([
    ['a rejected App', { token: () => json({ message: 'Bad credentials' }, 401) }],
    ['a GraphQL permission error', { graphql: () => json({ errors: [{ message: 'Resource not accessible by integration' }] }) }],
    ['a GitHub outage', { graphql: () => json({}, 503) }],
    ['a network failure', { graphql: () => { throw new TypeError('Network connection lost.'); } }],
  ])('turn %s into a bounded, briefly cached 502', async (_label, overrides) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await handleRequest(
      request({ headers: { Origin: PRODUCTION } }), env, github(overrides).effects,
    );

    const body = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(body)).toEqual({ error: UNAVAILABLE });
    expect(UNAVAILABLE).toBe('Live evidence is unavailable.');
    expect(FAILURE_CACHE).toBe('public, max-age=60');
    expect(response.headers.get('Cache-Control')).toBe(FAILURE_CACHE);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(PRODUCTION);
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0][0])).not.toContain('PRIVATE KEY');
  });

  it('logs a thrown non-Error value', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const effects: Effects = { now: () => 0, fetch: () => Promise.reject('offline') };

    expect((await handleRequest(request(), env, effects)).status).toBe(502);
    expect(log).toHaveBeenCalledWith('Evidence feed unavailable: offline');
  });

  it.each([
    ['a missing App ID', { GITHUB_APP_ID: '' }],
    ['a placeholder App ID', { GITHUB_APP_ID: 'APP_ID' }],
    ['a zero-padded installation ID', { GITHUB_INSTALLATION_ID: '0123' }],
    ['a missing owner', { GITHUB_OWNER: '' }],
    ['a missing repository', { GITHUB_REPO: '' }],
    ['a missing private key', { GITHUB_PRIVATE_KEY: '' }],
    ['a pasted token instead of a key', { GITHUB_PRIVATE_KEY: 'ghp_personal-access-token' }],
  ])('fail closed on %s without calling GitHub', async (_label, override) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { calls, effects } = github();
    const response = await handleRequest(request(), { ...env, ...override }, effects);

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('ghp_');
    expect(calls).toEqual([]);
  });
});

describe('gitHubApp', () => {
  it('reads the App identity only from Worker configuration', () => {
    expect(gitHubApp(env)).toEqual({
      appId: 123456,
      installationId: 7890,
      privateKey: PEM,
      owner: 'taco3064',
      repo: 'blueprint',
    });
  });
});
