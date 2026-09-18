import { renderLifecycleStateInvalid } from './lifecycle';
import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export type UpgradeRefusalFact
  = | { kind: 'no-running-version' }
    | { kind: 'not-adopted'; root: string }
    | { kind: 'invalid-state'; file: string; reason: string }
    | { kind: 'missing-state'; file: string; installed: string }
    | { kind: 'adoption-incomplete'; file: string }
    | { kind: 'state-changed'; file: string; detail: string }
    | { kind: 'not-installed'; applications: string[] }
    | { kind: 'mixed-installed'; versions: string[]; pending?: { from: string; to: string } }
    | { kind: 'installed-newer'; application: string; installed: string; target: string }
    | { kind: 'unsupported-source'; source: string; checkpoint: string }
    | { kind: 'downgrade'; source: string; target: string }
    | { kind: 'invalid-catalog'; problems: string[] }
    | { kind: 'pending-workflow'; files: string[] }
    | { kind: 'git-required' }
    | { kind: 'dirty-worktree'; changes: string[] }
    | { kind: 'config-unreadable'; application: string; cause: string }
    | { kind: 'no-manifest'; application: string }
    | { kind: 'install-mismatch'; manifest: string; installed: string | null; target: string }
    | { kind: 'no-pending'; id: string }
    | { kind: 'unknown-operation'; id: string; pending: string[] }
    | { kind: 'verification-failed'; id: string; files: string[] }
    | { kind: 'complete-dry-run' };

type Renderer<K extends UpgradeRefusalFact['kind']> = (
  fact: Extract<UpgradeRefusalFact, { kind: K }>,
) => string;

const RECOVERY = 'Nothing was changed.';

function interruptedInstall(pending: { from: string; to: string } | undefined): string {
  return pending === undefined
    ? ''
    : ` The recorded upgrade ${pending.from} → ${pending.to} resumes only an install it `
      + `interrupted, which leaves every application on ${pending.from} or ${pending.to}, so it `
      + 'did not leave this mix.';
}

const REFUSALS: { [K in UpgradeRefusalFact['kind']]: Renderer<K> } = {
  'no-running-version': () => 'upgrade cannot read the running @kekkai/blueprint version, so it '
    + 'has no target authority. Run it through the package: '
    + `\`npx @kekkai/blueprint@latest upgrade\`. ${RECOVERY}`,
  'not-adopted': (fact) => `no blueprint.config.mjs was found under ${fact.root}, so there is no `
    + 'adopted application to upgrade. Adopt Blueprint with `npx @kekkai/blueprint init --topology '
    + `layer-first|module-first\` instead. ${RECOVERY}`,
  'invalid-state': (fact) => renderLifecycleStateInvalid(fact.file, fact.reason),
  'missing-state': (fact) => `${fact.file} is missing, but @kekkai/blueprint ${fact.installed} `
    + 'always records it, so its lifecycle history cannot be proven. Restore it from version '
    + `control (for example \`git checkout -- ${fact.file}\`). Blueprint does not rebuild it from `
    + `the installed package, and no command re-establishes it here. ${RECOVERY}`,
  'adoption-incomplete': (fact) => `${fact.file} records Blueprint-owned files, but no completed `
    + 'lifecycle: the adoption that wrote them has not finished — it stopped part-way, deferred '
    + 'a required install, or never adopted its authored config. Finish it with '
    + `\`npx blueprint init\`, then run the upgrade. ${RECOVERY}`,
  'state-changed': (fact) => `${fact.file} changed while this upgrade was running `
    + `(${fact.detail}), so the recorded pending upgrade can no longer be proven. The lifecycle `
    + 'checkpoint stays where it was. Restore the file from version control, then re-run '
    + '`npx @kekkai/blueprint@latest upgrade`.',
  'not-installed': (fact) => `@kekkai/blueprint is not installed for ${fact.applications.join(', ')}, `
    + 'so the source version cannot be proven. Install the project dependencies first (for example '
    + `\`npm ci\`), then re-run the upgrade. ${RECOVERY}`,
  'mixed-installed': (fact) => 'adopted applications have different installed @kekkai/blueprint '
    + `versions (${fact.versions.join(', ')}).${interruptedInstall(fact.pending)} One `
    + 'repository keeps one Blueprint version; align the installs through the package manager, '
    + `then re-run the upgrade. ${RECOVERY}`,
  'installed-newer': (fact) => `${fact.application} resolves @kekkai/blueprint ${fact.installed}, `
    + `which is newer than the running ${fact.target}. upgrade never downgrades the package; run `
    + `\`npx @kekkai/blueprint@latest upgrade\` instead. ${RECOVERY}`,
  'unsupported-source': (fact) => `Blueprint ${fact.source} is below the supported upgrade window, `
    + `which starts at ${fact.checkpoint}. Reach ${fact.checkpoint} with that release's own tooling `
    + `(install @kekkai/blueprint@${fact.checkpoint}, run \`npx blueprint init\` and \`npx blueprint `
    + `doctor\`), commit, then run this upgrade again. ${RECOVERY}`,
  downgrade: (fact) => `the running @kekkai/blueprint ${fact.target} is older than this `
    + `repository's lifecycle ${fact.source}. upgrade never downgrades; run a release at or after `
    + `${fact.source}, for example \`npx @kekkai/blueprint@latest upgrade\`. ${RECOVERY}`,
  'invalid-catalog': (fact) => `this @kekkai/blueprint package ships an invalid upgrade catalog `
    + `(${fact.problems.join('; ')}). Report it at https://github.com/taco3064/blueprint/issues and `
    + `use a different release. ${RECOVERY}`,
  'pending-workflow': (fact) => `a Blueprint workflow is still in progress (${fact.files.join(', ')}). `
    + 'Finish the authoring or topology transformation it describes, or remove it deliberately, '
    + `then run the upgrade. ${RECOVERY}`,
  'git-required': () => 'starting an upgrade requires a Git worktree so every dependency, config, '
    + `and generated-file change stays recoverable. Initialize or enter the repository first. ${RECOVERY}`,
  'dirty-worktree': (fact) => `starting an upgrade requires a clean Git worktree; uncommitted: `
    + `${fact.changes.join(', ')}. Commit or stash them first so the upgrade can be reviewed and `
    + `reverted as one change. ${RECOVERY}`,
  'config-unreadable': (fact) => `${fact.application}/blueprint.config.mjs could not be loaded before `
    + `the upgrade (${fact.cause}). Fix it with the installed release first so the plan can measure `
    + `its facts. ${RECOVERY}`,
  'no-manifest': (fact) => `no package.json above ${fact.application} declares @kekkai/blueprint, `
    + 'so the package manager cannot move it to the target. Add it as a dev dependency, then '
    + `re-run. ${RECOVERY}`,
  'install-mismatch': (fact) => `after installing in ${fact.manifest}, the project resolves `
    + `@kekkai/blueprint ${fact.installed ?? 'nowhere'} instead of ${fact.target}. The pending `
    + 'upgrade stays recorded; fix the install (lockfile, workspace hoisting, or registry), then '
    + 're-run `npx @kekkai/blueprint@latest upgrade` to resume.',
  'no-pending': (fact) => `--complete ${fact.id} needs a pending upgrade, and none is recorded. `
    + 'Run `npx blueprint upgrade --dry-run` to see the lifecycle state.',
  'unknown-operation': (fact) => `${fact.id} is not a pending semantic operation of this upgrade. `
    + `Pending: ${fact.pending.length ? fact.pending.join(', ') : 'none'}.`,
  'verification-failed': (fact) => `${fact.id} is not done yet: ${fact.files.join(', ')} still `
    + 'exist. Finish the operation in blueprint-upgrade.md, then record it again.',
  'complete-dry-run': () => '--complete records durable progress and cannot be combined with '
    + '--dry-run.',
};

export function renderUpgradeRefusal(fact: UpgradeRefusalFact): OperationalText {
  const render = REFUSALS[fact.kind] as Renderer<typeof fact.kind>;

  return operationalText(render(fact as never));
}
