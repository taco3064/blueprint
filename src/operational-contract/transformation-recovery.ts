import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export function renderTransformationRecoveryGuide(origin: {
  head: string;
  applicationRoot: string;
  sourceRoot: string;
  sources: { unit: string; role: string; members: string[] }[];
}): OperationalText {
  const sources = origin.sources.map((source) =>
    `- ${source.unit} (${source.role}): ${source.members.join(', ')}`);

  return operationalText([
    '# Resume the recorded LF→MF transformation', '',
    `Origin HEAD: ${origin.head}; application: ${origin.applicationRoot}.`,
    `Source root: ${origin.sourceRoot}.`,
    'Recovery restored evidence only. It does not prove a completed transformation.', '',
    '## Recorded sources', '', ...sources, '',
    'Keep the recorded origin unchanged. In blueprint-transformation.json, record each source unit',
    'in target.decisions with destinations (the exact member destination file paths, never',
    'directories) and members: [{ source, destination }]. Preserve',
    'existing decisions. Restored JSON has initial decisions; review lost edits again.',
    'Each original member needs its own destination and preserved source identity. Move route',
    'composition into reserved app; use containers as module seeds, not repeated inner layers.',
    'Retain meaningful technical layers. Preserve extension and content except line endings and',
    'module paths in ESM imports/exports, literal dynamic imports, unshadowed CommonJS require',
    'and TypeScript import-equals. Do not use unrelated existing files as destinations.', '',
    'Author the module-first config and run project tests, build and lint. Keep the origin HEAD.',
    'Run `blueprint init --topology module-first` after all mappings and final architecture pass.',
    'Verification checks provenance, import analysis and architecture without baseline bypasses.',
    'Only successful verification retires the obligation. Recovery never performs retirement.', '',
  ].join('\n'));
}
