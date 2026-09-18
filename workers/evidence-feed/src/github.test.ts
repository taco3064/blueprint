import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  API,
  DISCUSSIONS_QUERY,
  MAX_PAGES,
  PAGE_SIZE,
  appJwt,
  derLength,
  fetchDiscussions,
  pkcs8FromPkcs1,
  privateKeyBytes,
  type Effects,
  type GitHubApp,
} from './github';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pkcs1Pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const pkcs8Pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKey = createPublicKey(privateKey);
const NOW = Date.UTC(2026, 8, 18, 12, 0, 0);
const TOKEN = 'ghs_installation-token';

const app: GitHubApp = {
  appId: 123456,
  installationId: 7890,
  privateKey: pkcs1Pem,
  owner: 'taco3064',
  repo: 'blueprint',
};

interface Call {
  url: string;
  init: RequestInit;
}

const decode = (segment: string) => JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const discussion = (number: number) => ({
  number,
  title: `Discussion ${number}`,
  bodyText: `Body ${number}`,
  url: `https://github.com/taco3064/blueprint/discussions/${number}`,
  createdAt: '2026-09-15T00:00:00Z',
  updatedAt: '2026-09-15T00:00:00Z',
});

const page = (numbers: number[], endCursor: string | null, hasNextPage = endCursor !== null) =>
  json({
    data: {
      repository: {
        discussions: { nodes: numbers.map(discussion), pageInfo: { hasNextPage, endCursor } },
      },
    },
  });

function github(
  graphql: (cursor: string | null) => Response,
  token: () => Response = () => json({ token: TOKEN }, 201),
) {
  const calls: Call[] = [];

  const effects: Effects = {
    now: () => NOW,
    fetch: async (url, init) => {
      calls.push({ url, init });

      if (url.endsWith('/access_tokens')) return token();

      return graphql(JSON.parse(String(init.body)).variables.cursor);
    },
  };

  return { calls, effects };
}

const header = (call: Call, name: string) => new Headers(call.init.headers).get(name);

describe('derLength', () => {
  it('encodes short and long DER lengths', () => {
    expect(derLength(0)).toEqual([0]);
    expect(derLength(0x7f)).toEqual([0x7f]);
    expect(derLength(0x80)).toEqual([0x81, 0x80]);
    expect(derLength(0xff)).toEqual([0x81, 0xff]);
    expect(derLength(0x100)).toEqual([0x82, 0x01, 0x00]);
    expect(derLength(1190)).toEqual([0x82, 0x04, 0xa6]);
    expect(derLength(0x10000)).toEqual([0x83, 0x01, 0x00, 0x00]);
  });
});

describe('privateKeyBytes', () => {
  it('wraps the PKCS#1 key GitHub downloads into the PKCS#8 bytes WebCrypto imports', () => {
    const expected = privateKey.export({ type: 'pkcs8', format: 'der' });

    expect(Buffer.from(privateKeyBytes(pkcs1Pem))).toEqual(expected);

    expect(Buffer.from(pkcs8FromPkcs1(privateKey.export({ type: 'pkcs1', format: 'der' }))))
      .toEqual(expected);
  });

  it('passes a PKCS#8 key through unchanged', () => {
    expect(Buffer.from(privateKeyBytes(pkcs8Pem)))
      .toEqual(privateKey.export({ type: 'pkcs8', format: 'der' }));
  });

  it('accepts a key whose line breaks were flattened to spaces', () => {
    const flattened = pkcs1Pem.replace(/\n/g, ' ');

    expect(Buffer.from(privateKeyBytes(flattened)))
      .toEqual(privateKey.export({ type: 'pkcs8', format: 'der' }));
  });

  it.each([
    ['empty', ''],
    ['a public key', publicKey.export({ type: 'spki', format: 'pem' }).toString()],
    ['mismatched armor', '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----'],
    ['an encrypted key', '-----BEGIN ENCRYPTED PRIVATE KEY-----\nAAAA\n-----END ENCRYPTED PRIVATE KEY-----'],
  ])('rejects %s', (_label, pem) => {
    expect(() => privateKeyBytes(pem)).toThrow('GITHUB_PRIVATE_KEY is not a PEM private key.');
  });
});

describe('appJwt', () => {
  it.each([['PKCS#1', pkcs1Pem], ['PKCS#8', pkcs8Pem]])('signs an RS256 App JWT with a %s key', async (_label, pem) => {
    const jwt = await appJwt({ ...app, privateKey: pem }, NOW);
    const [head, claims, signature] = jwt.split('.');

    expect(decode(head)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(claims)).toEqual({ iat: NOW / 1000 - 60, exp: NOW / 1000 + 540, iss: 123456 });

    expect(verify('RSA-SHA256', Buffer.from(`${head}.${claims}`), publicKey, Buffer.from(signature, 'base64url')))
      .toBe(true);

    expect(jwt).not.toMatch(/[+/=]/);
  });

  it('keeps the JWT lifetime inside GitHub\'s ten-minute ceiling', async () => {
    const { iat, exp } = decode((await appJwt(app, NOW)).split('.')[1]);

    expect(iat).toBeLessThan(NOW / 1000);
    expect(exp - NOW / 1000).toBeLessThanOrEqual(600);
  });

  it('floors a fractional clock', async () => {
    const { iat } = decode((await appJwt(app, NOW + 999)).split('.')[1]);

    expect(iat).toBe(NOW / 1000 - 60);
  });
});

describe('fetchDiscussions', () => {
  it('exchanges the App JWT for a down-scoped installation token', async () => {
    const { calls, effects } = github(() => page([1], null));

    await fetchDiscussions(app, effects);

    const [exchange] = calls;
    const jwt = header(exchange, 'Authorization')!.replace(/^Bearer /, '');

    expect(exchange.url).toBe(`${API}/app/installations/7890/access_tokens`);
    expect(exchange.init.method).toBe('POST');
    expect(decode(jwt.split('.')[1]).iss).toBe(123456);

    expect(JSON.parse(String(exchange.init.body))).toEqual({
      repositories: ['blueprint'],
      permissions: { discussions: 'read' },
    });
  });

  it('queries GraphQL with the installation token and only the configured repository', async () => {
    const { calls, effects } = github(() => page([1], null));

    await fetchDiscussions(app, effects);

    const [, query] = calls;
    const body = JSON.parse(String(query.init.body));

    expect(query.url).toBe(`${API}/graphql`);
    expect(query.init.method).toBe('POST');
    expect(header(query, 'Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(body).toEqual({ query: DISCUSSIONS_QUERY, variables: { owner: 'taco3064', name: 'blueprint', cursor: null } });
  });

  it('sends the headers GitHub requires on both requests', async () => {
    const { calls, effects } = github(() => page([1], null));

    await fetchDiscussions(app, effects);

    for (const call of calls) {
      expect(header(call, 'User-Agent')).toBe('blueprint-evidence-feed');
      expect(header(call, 'Accept')).toBe('application/vnd.github+json');
      expect(header(call, 'Content-Type')).toBe('application/json');
      expect(header(call, 'X-GitHub-Api-Version')).toBe('2022-11-28');
    }
  });

  it('asks for plain-text bodies, newest first, a full page at a time', () => {
    expect(PAGE_SIZE).toBe(100);
    expect(DISCUSSIONS_QUERY).toContain('first: 100');
    expect(DISCUSSIONS_QUERY).toContain('orderBy: { field: CREATED_AT, direction: DESC }');
    expect(DISCUSSIONS_QUERY).toContain('bodyText');
    expect(DISCUSSIONS_QUERY).not.toMatch(/bodyHTML|comments|reactions|\bbody\b/);
  });

  it('follows the cursor until GitHub reports no further page', async () => {
    const pages: Record<string, Response> = {
      start: page([5, 4], 'c1'),
      c1: page([3, 2], 'c2'),
      c2: page([1], null),
    };

    const { calls, effects } = github((cursor) => pages[cursor ?? 'start']);
    const nodes = await fetchDiscussions(app, effects);

    expect(nodes.map((node) => node.number)).toEqual([5, 4, 3, 2, 1]);

    expect(calls.slice(1).map((call) => JSON.parse(String(call.init.body)).variables.cursor))
      .toEqual([null, 'c1', 'c2']);
  });

  it('returns an empty list for a repository with no discussions', async () => {
    const { effects } = github(() => page([], null));

    expect(await fetchDiscussions(app, effects)).toEqual([]);
  });

  it('stops within the Free-plan subrequest budget', async () => {
    const { calls, effects } = github(() => page([1], 'next'));

    await expect(fetchDiscussions(app, effects)).rejects.toThrow('Discussions exceed 49 GraphQL pages.');
    expect(MAX_PAGES).toBe(49);
    expect(calls).toHaveLength(50);
  });

  it('refuses a next page without a cursor instead of re-reading the first one', async () => {
    const { calls, effects } = github(() => page([1], null, true));

    await expect(fetchDiscussions(app, effects)).rejects.toThrow('another page without a cursor');
    expect(calls).toHaveLength(2);
  });

  it.each([
    ['a rejected token exchange', json({ message: 'Bad credentials' }, 401), 'installation token request failed with 401'],
    ['a token response with no token', json({}, 201), 'GitHub returned no installation token.'],
    ['an empty token', json({ token: '' }, 201), 'GitHub returned no installation token.'],
  ])('fails on %s without querying GraphQL', async (_label, response, message) => {
    const { calls, effects } = github(() => page([1], null), () => response);

    await expect(fetchDiscussions(app, effects)).rejects.toThrow(message);
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['an HTTP failure', () => json({ message: 'nope' }, 502), 'GitHub GraphQL request failed with 502.'],
    ['GraphQL errors', () => json({ errors: [{ message: 'Resource not accessible by integration' }, { message: 'x' }] }), 'GitHub GraphQL returned errors: Resource not accessible by integration; x'],
    ['a missing repository', () => json({ data: { repository: null } }), 'GitHub GraphQL returned no repository discussions.'],
    ['a missing data object', () => json({}), 'GitHub GraphQL returned no repository discussions.'],
  ])('fails on %s', async (_label, graphql, message) => {
    const { effects } = github(graphql);

    await expect(fetchDiscussions(app, effects)).rejects.toThrow(message);
  });

  it('treats an empty errors array as success', async () => {
    const { effects } = github(() => json({
      data: {
        repository: {
          discussions: {
            nodes: [discussion(1)],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
      errors: [],
    }));

    expect(await fetchDiscussions(app, effects)).toHaveLength(1);
  });
});
