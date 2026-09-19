import type { DoctorCheckView } from './doctor';

export type AliasConsumerEvidence = {
  consumer: 'typescript' | 'bundler-runtime' | 'package-subpath' | 'test-runner';
  status: 'verified' | 'missing' | 'absent' | 'not-applicable' | 'unverified';
  aliases: string[];
  files: string[];
  unreadable?: string[];
  installed?: string[];
};

const ALIAS_VALUE_FORMS = '`\'<alias>\': <value>` or `.set(\'<alias>\', <value>)` whose '
  + '<value> is `\'<dir>\'`, `fileURLToPath(new URL(\'<dir>\', import.meta.url))`, or '
  + '`path.resolve(__dirname, \'<dir>\')` (also bare `resolve`)';

const PROVABLE_ALIAS_FORMS: Record<AliasConsumerEvidence['consumer'], string> = {
  typescript: '`compilerOptions.paths` entries in a tsconfig that parses',
  'bundler-runtime': `${ALIAS_VALUE_FORMS}, or a called \`vite-tsconfig-paths\` plugin whose `
    + '`compilerOptions.paths` match',
  'package-subpath': 'string `imports` entries (`"<alias>/*": "<dir>/*"`) in package.json',
  'test-runner': `${ALIAS_VALUE_FORMS}, or a string Jest \`moduleNameMapper\` target`,
};

export function renderAliasConsumer(fact: {
  evidence: AliasConsumerEvidence;
  sourceRoot: string;
}): DoctorCheckView {
  const { evidence } = fact;
  const names = evidence.aliases.map((name) => `"${name}"`).join(', ');
  const label = `import alias · ${evidence.consumer}`;

  const structural = {
    consumer: evidence.consumer,
    status: evidence.status,
    aliases: evidence.aliases,
    files: evidence.files,
  };

  if (evidence.status === 'verified') {
    return { label, ok: true, ...structural };
  }

  if (evidence.status === 'missing') {
    const dir = fact.sourceRoot === '.' ? '.' : `./${fact.sourceRoot}`;

    const remedy = evidence.consumer === 'typescript'
      ? `declare compilerOptions.paths ("${evidence.aliases[0]}/*": ["${dir}/*"])`
      : `declare ${names} in the recognised ${evidence.consumer} configuration`;

    return { label, ok: false, detail: `${names} is missing — ${remedy}`, ...structural };
  }

  const reason = evidence.status === 'not-applicable'
    ? 'the configured aliases are not package # subpaths'
    : evidence.status === 'absent'
      ? `no recognised ${evidence.consumer} configuration is present`
      : unverifiedReason(evidence);

  return evidence.status === 'unverified'
    ? { label, ok: true, skipped: reason, ...structural }
    : { label, ok: true, detail: reason, ...structural };
}

function unverifiedReason(evidence: AliasConsumerEvidence): string {
  return `${unverifiedSituation(evidence)} — this check proves only `
    + PROVABLE_ALIAS_FORMS[evidence.consumer];
}

function unverifiedSituation(evidence: AliasConsumerEvidence): string {
  const { consumer, unreadable, installed } = evidence;
  const files = evidence.files.join(', ');

  if (unreadable) {
    return `${unreadable.join(', ')} could not be read statically`;
  }

  if (installed) {
    return `${files} lists ${installed.join(', ')}, but no ${consumer} configuration file was found`;
  }

  return evidence.files.length
    ? `read ${files}, but not every alias is declared there in a form this check can prove`
    : `no ${consumer} configuration file was found`;
}
