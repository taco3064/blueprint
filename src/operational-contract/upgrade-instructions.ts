import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export type UpgradeVerificationRuleFact
  = | { kind: 'confirm' }
    | { kind: 'no-files'; pattern: string };

const INSTRUCTIONS: Record<string, OperationalText> = {
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
