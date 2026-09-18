export interface EvidenceItem {
  number: number;
  title: string;
  preview: string[];
  url: string;
  createdAt: string;
  updatedAt: string;
}

export type EvidenceState =
  | { status: 'loading' }
  | { status: 'ready'; items: EvidenceItem[] }
  | { status: 'empty' }
  | { status: 'unavailable' };

export interface LoadOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export const DISCUSSIONS_URL = 'https://github.com/taco3064/blueprint/discussions';
export const EVIDENCE_FEED_URL = 'https://blueprint-evidence-feed.tabacotaco.workers.dev/discussions';
export const FEED_TIMEOUT_MS = 8000;

const DISCUSSION_URL = /^https:\/\/github\.com\/taco3064\/blueprint\/discussions\/\d+$/;
const UNAVAILABLE: EvidenceState = { status: 'unavailable' };

const isText = (value: unknown): value is string => typeof value === 'string';

function isEvidence(value: unknown): value is EvidenceItem {
  const item = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;

  return Number.isInteger(item.number)
    && isText(item.title)
    && Array.isArray(item.preview) && item.preview.every(isText)
    && isText(item.url) && DISCUSSION_URL.test(item.url)
    && isText(item.createdAt) && !Number.isNaN(Date.parse(item.createdAt))
    && isText(item.updatedAt);
}

export function feedUrl(override: string | undefined): string {
  return override || EVIDENCE_FEED_URL;
}

export function parseFeed(payload: unknown): EvidenceItem[] | null {
  const discussions = (payload as { discussions?: unknown } | null)?.discussions;

  return Array.isArray(discussions) && discussions.every(isEvidence) ? discussions : null;
}

export async function loadEvidence(url: string, options: LoadOptions = {}): Promise<EvidenceState> {
  try {
    const response = await (options.fetch ?? fetch)(url, {
      credentials: 'omit',
      signal: AbortSignal.timeout(options.timeoutMs ?? FEED_TIMEOUT_MS),
    });

    const items = response.ok ? parseFeed(await response.json()) : null;

    if (!items) return UNAVAILABLE;

    return items.length > 0 ? { status: 'ready', items } : { status: 'empty' };
  } catch {
    return UNAVAILABLE;
  }
}

export function formatDate(iso: string, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(new Date(iso));
}
