import { generateKeyPairSync } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import worker from './index';

const env = {
  GITHUB_APP_ID: '123456',
  GITHUB_INSTALLATION_ID: '7890',
  GITHUB_PRIVATE_KEY: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    .export({ type: 'pkcs8', format: 'pem' }).toString(),
  GITHUB_OWNER: 'taco3064',
  GITHUB_REPO: 'blueprint',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the Worker entry', () => {
  it('reaches GitHub through the runtime fetch and clock', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 8, 18), toFake: ['Date'] });

    const fetch = vi.fn(async (url: string, _init: RequestInit) => url.endsWith('/access_tokens')
      ? new Response(JSON.stringify({ token: 'ghs_token' }), { status: 201 })
      : new Response(JSON.stringify({
          data: {
            repository: {
              discussions: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
            },
          },
        })));

    vi.stubGlobal('fetch', fetch);

    const response = await worker.fetch(new Request('https://feed.example.workers.dev/discussions'), env);
    const jwt = new Headers(fetch.mock.calls[0]![1].headers).get('Authorization')!.split('.')[1];

    expect(await response.json()).toEqual({ discussions: [] });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(Buffer.from(jwt, 'base64url').toString()).iat).toBe(Date.UTC(2026, 8, 18) / 1000 - 60);
  });
});
