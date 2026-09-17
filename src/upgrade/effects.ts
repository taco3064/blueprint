import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { runInit } from '../bootstrap';
import { runDoctor, runInspect } from '../inspect';
import type { PackageLocation } from '../lifecycle';
import type { UpgradeVerificationFact } from '../operational-contract';

export type CommandRunner = (command: string, cwd: string) => void;

export type Handoff = (installed: PackageLocation, cwd: string) => number;

export type Reconciler = (root: string, log: (line: string) => void) => Promise<unknown>;

export type ApplicationVerifier = (
  root: string,
  application: string,
) => Promise<UpgradeVerificationFact>;

/* v8 ignore start -- real package manager and child process; tests inject both effects */
export const defaultRunner: CommandRunner = (command, cwd) => {
  execSync(command, { cwd, stdio: 'inherit' });
};

export const defaultHandoff: Handoff = (installed, cwd) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(installed.root, 'package.json'), 'utf-8'));
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin.blueprint;

  return spawnSync(process.execPath, [path.join(installed.root, bin), 'upgrade'], {
    cwd,
    stdio: 'inherit',
  }).status ?? 1;
};
/* v8 ignore stop */

export const defaultReconciler: Reconciler = (root, log) => runInit(root, { log });

export const verifyApplication: ApplicationVerifier = async (root, application) => {
  const silent = () => {};

  const inspect = await runInspect(root, { baseline: true, log: silent });
  const doctor = await runDoctor(root, { log: silent });

  return {
    application,
    inspect: { ok: inspect.ok, findings: inspect.findings.length },
    doctor: {
      verdict: doctor.verdict,
      failed: doctor.checks.filter((check) => !check.ok).map((check) => check.label),
      skipped: doctor.checks.filter((check) => check.skipped !== undefined)
        .map((check) => check.label),
    },
  };
};

export function verificationPassed(fact: UpgradeVerificationFact): boolean {
  return fact.inspect.ok && fact.doctor.verdict === 'complete';
}
