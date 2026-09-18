import type { DiscussionNode } from './projection';

export interface GitHubApp {
  appId: number;
  installationId: number;
  privateKey: string;
  owner: string;
  repo: string;
}

export interface Effects {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  now: () => number;
}

interface Session {
  app: GitHubApp;
  effects: Effects;
  token: string;
}

interface DiscussionPage {
  nodes: DiscussionNode[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

interface GraphQLPayload {
  data?: { repository?: { discussions?: DiscussionPage } | null };
  errors?: { message: string }[];
}

export const API = 'https://api.github.com';
export const PAGE_SIZE = 100;
export const MAX_PAGES = 49;

export const DISCUSSIONS_QUERY = `query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    discussions(first: ${PAGE_SIZE}, after: $cursor, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes { number title bodyText url createdAt updatedAt }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const HEADERS = {
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'User-Agent': 'blueprint-evidence-feed',
  'X-GitHub-Api-Version': '2022-11-28',
};

const RSA_ALGORITHM = [
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
];

const PKCS8_VERSION = [0x02, 0x01, 0x00];
const PEM = /-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]+?)-----END \1PRIVATE KEY-----/;
const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const encodeJson = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));

export function derLength(length: number): number[] {
  if (length < 0x80) return [length];

  const bytes: number[] = [];

  for (let rest = length; rest > 0; rest = Math.floor(rest / 0x100)) bytes.unshift(rest % 0x100);

  return [0x80 + bytes.length, ...bytes];
}

export function pkcs8FromPkcs1(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const body = [...PKCS8_VERSION, ...RSA_ALGORITHM, 0x04, ...derLength(pkcs1.length), ...pkcs1];

  return Uint8Array.from([0x30, ...derLength(body.length), ...body]);
}

export function privateKeyBytes(pem: string): Uint8Array<ArrayBuffer> {
  const match = PEM.exec(pem);

  if (!match) throw new Error('GITHUB_PRIVATE_KEY is not a PEM private key.');

  const der = Uint8Array.from(atob(match[2].replace(/\s+/g, '')), (char) => char.charCodeAt(0));

  return match[1] ? pkcs8FromPkcs1(der) : der;
}

export async function appJwt(app: GitHubApp, now: number): Promise<string> {
  const issuedAt = Math.floor(now / 1000) - 60;
  const claims = { iat: issuedAt, exp: issuedAt + 600, iss: app.appId };
  const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson(claims)}`;
  const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };

  const key = await crypto.subtle.importKey(
    'pkcs8', privateKeyBytes(app.privateKey), algorithm, false, ['sign'],
  );

  const signature = await crypto.subtle.sign(algorithm, key, encoder.encode(unsigned));

  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

async function installationToken(app: GitHubApp, effects: Effects): Promise<string> {
  const response = await effects.fetch(`${API}/app/installations/${app.installationId}/access_tokens`, {
    method: 'POST',
    headers: { ...HEADERS, Authorization: `Bearer ${await appJwt(app, effects.now())}` },
    body: JSON.stringify({ repositories: [app.repo], permissions: { discussions: 'read' } }),
  });

  if (!response.ok) throw new Error(`GitHub installation token request failed with ${response.status}.`);

  const { token } = await response.json() as { token?: unknown };

  if (typeof token !== 'string' || token === '') throw new Error('GitHub returned no installation token.');

  return token;
}

async function discussionPage(session: Session, cursor: string | null): Promise<DiscussionPage> {
  const { app, effects, token } = session;

  const response = await effects.fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query: DISCUSSIONS_QUERY,
      variables: { owner: app.owner, name: app.repo, cursor },
    }),
  });

  if (!response.ok) throw new Error(`GitHub GraphQL request failed with ${response.status}.`);

  const payload = await response.json() as GraphQLPayload;

  if (payload.errors?.length) {
    throw new Error(`GitHub GraphQL returned errors: ${payload.errors.map((error) => error.message).join('; ')}`);
  }

  const page = payload.data?.repository?.discussions;

  if (!page) throw new Error('GitHub GraphQL returned no repository discussions.');

  return page;
}

export async function fetchDiscussions(
  app: GitHubApp, effects: Effects,
): Promise<DiscussionNode[]> {
  const session = { app, effects, token: await installationToken(app, effects) };
  const nodes: DiscussionNode[] = [];
  let cursor: string | null = null;

  for (let pages = 1; ; pages += 1) {
    const page = await discussionPage(session, cursor);

    nodes.push(...page.nodes);

    if (!page.pageInfo.hasNextPage) return nodes;
    if (!page.pageInfo.endCursor) throw new Error('GitHub GraphQL reported another page without a cursor.');
    if (pages === MAX_PAGES) throw new Error(`Discussions exceed ${MAX_PAGES} GraphQL pages.`);

    cursor = page.pageInfo.endCursor;
  }
}
