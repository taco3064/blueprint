import { occurrences } from '../lifecycle';

const START = '<!-- BLUEPRINT:START -->';
const END = '<!-- BLUEPRINT:END -->';

export type SectionStrip
  = | { status: 'absent' }
    | { status: 'malformed' }
    | { status: 'stripped'; text: string; empty: boolean };

export function stripManagedSection(text: string): SectionStrip {
  const start = text.indexOf(START);

  if (start === -1) {
    return text.includes(END) ? { status: 'malformed' } : { status: 'absent' };
  }

  const end = text.indexOf(END, start);

  if (end === -1 || text.includes(START, start + START.length)) {
    return { status: 'malformed' };
  }

  const tail = text.slice(end + END.length).replace(/^\r?\n/, '');
  const head = text.slice(0, start);
  const stripped = tail ? head + tail : head.replace(/(\r?\n)(?:\r?\n)+$/, '$1');

  return { status: 'stripped', text: stripped, empty: stripped.trim() === '' };
}

export type EditReversal
  = | { status: 'reversed'; text: string }
    | { status: 'absent' }
    | { status: 'ambiguous'; occurrences: number }
    | { status: 'irreversible' };

export function reverseEdit(text: string, edit: { before: string; after: string }): EditReversal {
  if (!edit.after) {
    return { status: 'irreversible' };
  }

  const count = occurrences(text, edit.after);

  if (count !== 1) {
    return count ? { status: 'ambiguous', occurrences: count } : { status: 'absent' };
  }

  const at = text.indexOf(edit.after);

  return {
    status: 'reversed',
    text: `${text.slice(0, at)}${edit.before}${text.slice(at + edit.after.length)}`,
  };
}

export type ScriptRestore
  = | { status: 'restored'; text: string }
    | { status: 'absent' }
    | { status: 'diverged'; current: string | null }
    | { status: 'unreadable' };

function indentOf(text: string): string {
  return /^[ \t]+(?=")/m.exec(text)?.[0] ?? '  ';
}

export function restoreScript(
  text: string,
  record: { name: string; before: string | null; after: string },
): ScriptRestore {
  let manifest: { scripts?: Record<string, unknown> };

  try {
    manifest = JSON.parse(text);
  } catch {
    return { status: 'unreadable' };
  }

  const current = manifest.scripts?.[record.name];

  if (current !== record.after) {
    return current === (record.before ?? undefined)
      ? { status: 'absent' }
      : { status: 'diverged', current: typeof current === 'string' ? current : null };
  }

  const scripts = { ...manifest.scripts };

  if (record.before === null) {
    delete scripts[record.name];
  } else {
    scripts[record.name] = record.before;
  }

  const restored = Object.fromEntries(Object.entries({ ...manifest, scripts })
    .filter(([key]) => key !== 'scripts' || Object.keys(scripts).length));

  return { status: 'restored', text: `${JSON.stringify(restored, null, indentOf(text))}\n` };
}

export function removeIgnoreGroup(text: string, comment: string): string | null {
  const lines = text.split(/(?<=\n)/);
  const at = lines.findIndex((line) => line.replace(/\r?\n$/, '') === comment);

  if (at === -1) {
    return null;
  }

  let end = at + 1;

  while (end < lines.length && lines[end].startsWith('!')) {
    end++;
  }

  const start = at > 0 && !lines[at - 1].trim() ? at - 1 : at;

  return [...lines.slice(0, start), ...lines.slice(end)].join('');
}

interface Manifest {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function parseManifest(text: string | null): Manifest {
  try {
    return JSON.parse(text ?? '{}') as Manifest;
  } catch {
    return {};
  }
}
