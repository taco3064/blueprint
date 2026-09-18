export interface SmokeOptions {
  fetch?: typeof fetch;
  attempts?: number;
  wait?: (ms: number) => Promise<void>;
  version?: string;
}

export interface SmokeResult {
  served: string[];
  problems: string[];
}

export const ORIGIN = 'https://taco3064.github.io';
export const ATTEMPTS = 12;
export const RETRY_MS = 5000;
export const VERSION_HEADER = 'X-Worker-Version';

const DISCUSSION_URL = /^https:\/\/github\.com\/taco3064\/blueprint\/discussions\/\d+$/;

type Probe = Required<Omit<SmokeOptions, 'version'>> & Pick<SmokeOptions, 'version'>;

const failed = (problem: string): SmokeResult => ({ served: [], problems: [problem] });

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const settled = (request: Promise<Response>) => request.then((response) => response, () => null);

const fromVersion = (response: Response, version: string | undefined) =>
  version === undefined || response.headers.get(VERSION_HEADER) === version;

function isEvidence(value: unknown): value is { number: number; title: string } {
  const item = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;

  return Number.isInteger(item.number)
    && typeof item.title === 'string'
    && Array.isArray(item.preview)
    && typeof item.url === 'string' && DISCUSSION_URL.test(item.url);
}

async function versionIsLive(base: string, options: Probe): Promise<boolean> {
  for (let attempt = 1; ; attempt += 1) {
    const probe = await settled(options.fetch(`${base}/discussions?deploy-check`));

    if (probe?.status === 400 && fromVersion(probe, options.version)) return true;
    if (attempt === options.attempts) return false;

    await options.wait(RETRY_MS);
  }
}

async function checkFeed(base: string, options: Probe): Promise<SmokeResult> {
  const response = await options.fetch(`${base}/discussions`, { headers: { Origin: ORIGIN } });

  if (response.status !== 200) {
    return failed(`GET /discussions answered ${response.status}. A first deployment answers 502 `
      + 'until GITHUB_PRIVATE_KEY is added to the Worker\'s secrets; otherwise read the Worker log '
      + 'with `npx wrangler tail`.');
  }

  const body = await response.json().catch(() => null) as { discussions?: unknown } | null;
  const items = body?.discussions;

  if (!Array.isArray(items) || !items.every(isEvidence)) {
    return failed('GET /discussions answered 200 without a Discussion feed.');
  }

  const problems = [
    ...response.headers.get('Access-Control-Allow-Origin') === ORIGIN
      ? []
      : [`GET /discussions did not grant ${ORIGIN} browser access.`],
    ...fromVersion(response, options.version)
      ? []
      : [`GET /discussions answered from ${response.headers.get(VERSION_HEADER)}, not ${options.version}.`],
  ];

  return { served: items.map((item) => `#${item.number} ${item.title}`), problems };
}

export async function smoke(base: string, options: SmokeOptions = {}): Promise<SmokeResult> {
  if (!/^https?:\/\/[^/]+$/.test(base)) return failed(`"${base}" is not a Worker origin URL.`);

  const effects: Probe = {
    fetch: options.fetch ?? fetch,
    attempts: options.attempts ?? ATTEMPTS,
    wait: options.wait ?? sleep,
    version: options.version,
  };

  if (!(await versionIsLive(base, effects))) {
    return failed(`${base}/discussions never answered its query-string probe with 400 from `
      + `${effects.version ? `version ${effects.version}` : 'any version'}, so the deployment is not serving there.`);
  }

  return checkFeed(base, effects)
    .catch((error: unknown) => failed(`GET /discussions failed: ${String(error)}`));
}

export function render(base: string, result: SmokeResult): string {
  return [
    `### Evidence feed: ${base}/discussions`,
    '',
    result.problems.length > 0 ? '**Failed**' : `**Discussions served: ${result.served.length}**`,
    '',
    ...result.served.map((line) => `- ${line}`),
    ...result.problems.map((problem) => `- ${problem}`),
  ].join('\n');
}

/* v8 ignore start -- the live CI invocation; smoke and render are tested with an injected fetch */
if (import.meta.main) {
  const [base = '', version] = process.argv.slice(2);
  const result = await smoke(base, { version });

  console.log(render(base, result));
  process.exitCode = result.problems.length > 0 ? 1 : 0;
}
/* v8 ignore stop */
