import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export type UpgradeVerificationRuleFact
  = | { kind: 'confirm' }
    | { kind: 'no-files'; pattern: string };

const INSTRUCTIONS: Record<string, OperationalText> = {
  'review-module-root-unit': operationalText([
    'Blueprint 4.2 makes each ordinary module root one entry-only unit. Review each listed',
    'application; a layer-first application has no module-root migration and may record that',
    'no-op. For module-first, inventory immediate governed root source and exclude declared',
    'inner-layer descendants and the reserved recursive app tree.',
    'A root with source needs exactly one supported index entry. Import its bare module alias,',
    'never /index or a private member. Review exports manually: Blueprint never chooses the',
    'public API, moves source, or generates an application barrel. If the entry is already valid',
    'and private siblings are transitively reachable, retain the files in place. Layer-only',
    'modules need no entry and no empty barrel. Resolve missing/ambiguous entries, private path',
    'imports, and proven orphan-root-file findings; inner layers still cannot import upward.',
    'Only unchanged canonical React/Vue preset guidance recommends `components` for presentation.',
    'Every custom architecture requires owner decision, including a `components` name alone or',
    'unique `views.does` presentation prose. No runtime-selected owner exists. Do not add layers,',
    'edit responsibilities, or infer that private or single-consumer presentation is root code.',
    'Preserve retained LF member provenance and custom entry names for later reversal; semantic',
    'placement review never silently replaces proven restoration destinations.',
    'Run inspect, doctor, and the adopter lint/typecheck/tests/build after the reviewed changes.',
    'Record limitations such as parse failures or runtime-dependent imports; green gates do not',
    'automatically prove responsibility or select exports. Complete only after owner review.',
  ]),
  'review-retired-module-private': operationalText([
    'Blueprint 4.0 retired `module.private` with no direct replacement, so the migrated',
    'configuration no longer declares it. For each listed application, read the original',
    'source: the saved `blueprint.config.mjs.pre-v4-<sha256>` beside `blueprint.config.mjs`',
    'when Blueprint rewrote the config, otherwise `blueprint.config.mjs` itself. Choose the',
    'branch by where `module.private` was declared, not by whether the config calls a preset:',
    '',
    '- If the owner\'s own source declares `module.private` (the config or a local file it',
    '  imports), treat each value as a retired private unit-member/path name, not as a layer.',
    '  Compare the old unit entry/private contract with the current `layout` and `entry`',
    '  behavior. Use layer-level `allowedImporters` / `selfOnly` only when repository evidence',
    '  independently proves a layer restriction was intended. Record anything the current',
    '  schema cannot express as an owner decision instead of inventing a layer policy.',
    '- If no owner source declares it, `module.private` came from a Blueprint 3.2 preset call,',
    '  and the 4.x preset carries its own governance. Confirm the listed private names still',
    '  have the unit-entry/private behavior the owner intends; name collisions do not turn',
    '  those member/path names into declared layers.',
    '- Delete the `blueprint.config.mjs.pre-v4-*` backup, if one exists, once the review is',
    '  finished.',
  ]),
};

export const UPGRADE_INSTRUCTION_IDS = Object.keys(INSTRUCTIONS);

export function renderUpgradeInstruction(id: string): OperationalText | null {
  return Object.hasOwn(INSTRUCTIONS, id) ? INSTRUCTIONS[id] : null;
}

export function renderUpgradeVerification(
  verification: UpgradeVerificationRuleFact,
): OperationalText {
  return operationalText(verification.kind === 'no-files'
    ? `Blueprint verifies that no \`${verification.pattern}\` file remains in the listed `
    + 'applications.'
    : 'Blueprint cannot measure this operation; completing it records your explicit '
      + 'confirmation that the work above is done.');
}
