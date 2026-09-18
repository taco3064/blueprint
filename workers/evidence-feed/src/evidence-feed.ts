import { fetchDiscussions, type Effects, type GitHubApp } from './github';
import { project } from './projection';

export interface Env {
  GITHUB_APP_ID: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  CF_VERSION_METADATA?: { id: string };
}

export const FEED_PATH = '/discussions';
export const ALLOWED_ORIGINS = ['https://taco3064.github.io', 'http://localhost:5173'];
export const FRESH_CACHE = 'public, max-age=300';
export const FAILURE_CACHE = 'public, max-age=60';
export const BROWSER_CACHE = 'no-cache';
export const UNAVAILABLE = 'Live evidence is unavailable.';
export const VERSION_HEADER = 'X-Worker-Version';

export const CACHE_KEY_HEADERS = [
  'x-http-method-override',
  'x-http-method',
  'x-method-override',
  'x-forwarded-host',
  'x-host',
  'x-original-url',
  'x-rewrite-url',
  'forwarded',
  'cloudflare-workers-version-key',
];

const IDENTIFIER = /^[1-9]\d*$/;

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

const refuse = (status: number, error: string, headers: Record<string, string> = {}) =>
  json(status, { error }, { 'Cache-Control': 'no-store', ...headers });

const cors = (origin: string | null): Record<string, string> =>
  origin === null ? {} : { 'Access-Control-Allow-Origin': origin };

function keysTheCache(headers: Headers): boolean {
  return CACHE_KEY_HEADERS.some((name) => headers.has(name))
    || !/^(https?)?$/i.test(headers.get('x-forwarded-scheme') ?? '');
}

export function gitHubApp(env: Env): GitHubApp {
  if (!IDENTIFIER.test(env.GITHUB_APP_ID) || !IDENTIFIER.test(env.GITHUB_INSTALLATION_ID)) {
    throw new Error('GITHUB_APP_ID and GITHUB_INSTALLATION_ID must be GitHub numeric identifiers.');
  }

  if (!env.GITHUB_OWNER || !env.GITHUB_REPO) throw new Error('GITHUB_OWNER and GITHUB_REPO are required.');

  return {
    appId: Number(env.GITHUB_APP_ID),
    installationId: Number(env.GITHUB_INSTALLATION_ID),
    privateKey: env.GITHUB_PRIVATE_KEY,
    owner: env.GITHUB_OWNER,
    repo: env.GITHUB_REPO,
  };
}

function gate(request: Request): Response | null {
  const origin = request.headers.get('Origin');

  if (new URL(request.url).pathname !== FEED_PATH) return refuse(404, 'Not found.');

  if (!['GET', 'HEAD'].includes(request.method)) {
    return refuse(405, 'Method not allowed.', { Allow: 'GET, HEAD' });
  }

  if (request.url.includes('?')) return refuse(400, 'Query parameters are not accepted.');
  if (keysTheCache(request.headers)) return refuse(400, 'Cache-key request headers are not accepted.');
  if (origin !== null && !ALLOWED_ORIGINS.includes(origin)) return refuse(403, 'Origin not allowed.');

  return null;
}

async function feed(request: Request, env: Env, effects: Effects): Promise<Response> {
  const headers = {
    'Cache-Control': BROWSER_CACHE,
    Vary: 'Origin',
    ...cors(request.headers.get('Origin')),
  };

  try {
    const discussions = project(await fetchDiscussions(gitHubApp(env), effects));

    return json(200, { discussions }, { 'Cloudflare-CDN-Cache-Control': FRESH_CACHE, ...headers });
  } catch (error) {
    console.error(`Evidence feed unavailable: ${error instanceof Error ? error.message : String(error)}`);

    return json(502, { error: UNAVAILABLE }, {
      'Cloudflare-CDN-Cache-Control': FAILURE_CACHE, ...headers,
    });
  }
}

export async function handleRequest(
  request: Request, env: Env, effects: Effects,
): Promise<Response> {
  const response = gate(request) ?? await feed(request, env, effects);

  if (env.CF_VERSION_METADATA) response.headers.set(VERSION_HEADER, env.CF_VERSION_METADATA.id);

  return response;
}
