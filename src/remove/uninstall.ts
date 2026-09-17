import fs from 'node:fs';
import path from 'node:path';

import { PACKAGE_NAME } from '../lifecycle';
import { resolveProjectContext } from '../project';
import { CARRIER_DEPENDENCIES } from './application';
import type { RemovalFacts } from './facts';
import { parseManifest } from './documents';
import { relativeDirectory, remainingText } from './references';
import type { PlannedFiles } from './references';
import type { RemovalResidue, UninstallStep } from './types';

const CONFIG_NAME = /^(?:\.eslintrc(?:\.(?:c?js|json|ya?ml))?|[\w.-]+\.config\.[cm]?[jt]s)$/;

function declared(root: string): string[] {
  const manifest = parseManifest(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));

  return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
}

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);

  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function referenced(
  name: string,
  context: { facts: RemovalFacts; manifest: string; planned: PlannedFiles },
): boolean {
  const { facts, manifest, planned } = context;

  const directories = [...new Set([
    manifest,
    ...facts.scope.map((application) => application.root),
  ])];

  const quoted = new RegExp(`['"\`]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/|['"\`])`);
  const binary = new RegExp(`(?:^|[\\s;&|(])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);

  return directories.some((directory) => {
    const prefix = relativeDirectory(facts.root, directory);
    const scripts = remainingText(facts.root, path.posix.join(prefix, 'package.json'), planned);

    const commands = Object.values(parseManifest(scripts).scripts ?? {});

    return commands.some((command) => binary.test(command))
      || fs.readdirSync(directory).filter((file) => CONFIG_NAME.test(file)).some((file) =>
        quoted.test(remainingText(facts.root, path.posix.join(prefix, file), planned) ?? ''));
  });
}

function command(manager: UninstallStep['packageManager'], names: string[]): string {
  return manager === 'npm'
    ? `npm uninstall ${names.join(' ')}`
    : `${manager} remove ${names.join(' ')}`;
}

function removableNames(
  manifest: string,
  context: { facts: RemovalFacts; key: string; planned: PlannedFiles },
  residues: RemovalResidue[],
): string[] {
  const { facts, key, planned } = context;

  const recorded = new Set(facts.scope.filter((entry) => entry.manifest?.root === manifest)
    .flatMap((entry) => entry.provenance.flatMap((record) =>
      record.kind === 'dependency' ? [record.name] : [])));

  const carriers = declared(manifest).filter((name) => CARRIER_DEPENDENCIES.includes(name));
  const names = [PACKAGE_NAME];

  for (const name of carriers) {
    if (!recorded.has(name)) {
      residues.push(...facts.mode === 'provenance'
        ? []
        : [{
            kind: 'dependency-kept' as const, name, manifest: key, reason: 'unrecorded' as const,
          }]);
    } else if (referenced(name, { facts, manifest, planned })) {
      residues.push({ kind: 'dependency-kept', name, manifest: key, reason: 'referenced' });
    } else {
      names.push(name);
    }
  }

  return names;
}

export function uninstallPlan(
  facts: RemovalFacts,
  planned: PlannedFiles,
): { steps: UninstallStep[]; residues: RemovalResidue[] } {
  const steps: UninstallStep[] = [];
  const residues: RemovalResidue[] = [];

  const manifests = [...new Set(facts.scope.flatMap((entry) =>
    entry.manifest ? [entry.manifest.root] : []))];

  for (const manifest of manifests) {
    const key = relativeDirectory(facts.root, manifest) || '.';

    if (facts.remaining.some((entry) => contains(manifest, path.resolve(facts.root, entry)))) {
      residues.push({
        kind: 'dependency-kept', name: PACKAGE_NAME, manifest: key, reason: 'shared',
      });

      continue;
    }

    const names = removableNames(manifest, { facts, key, planned }, residues);
    const packageManager = resolveProjectContext(manifest).packageManager;

    steps.push({
      manifest: key, root: manifest, packageManager, names, command: command(packageManager, names),
    });
  }

  return { steps, residues };
}
