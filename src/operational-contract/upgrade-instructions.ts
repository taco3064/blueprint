import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export type UpgradeVerificationRuleFact
  = | { kind: 'confirm' }
    | { kind: 'no-files'; pattern: string };

const INSTRUCTIONS: Record<string, OperationalText> = {
  'review-retired-module-private': operationalText([
    'Blueprint 4.0 retired `module.private` with no direct replacement, so the migrated',
    'configuration no longer declares it. For each listed application:',
    '',
    '- If `blueprint.config.mjs` calls a Blueprint preset, the 4.x preset carries its own',
    '  governance for those layers. Confirm the listed layers are still governed the way the',
    '  owner intends.',
    '- If the configuration is authored, read the saved original',
    '  `blueprint.config.mjs.pre-v4-<sha256>` beside it and restate the private-layer intent',
    '  with the current schema: `allowedImporters` with `selfOnly`, or a folder `layout` with',
    '  an `entry`. Record anything the schema cannot express as an owner decision in your',
    '  report instead of inventing a rule.',
    '- Delete the `blueprint.config.mjs.pre-v4-*` backup once the review is finished.',
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
