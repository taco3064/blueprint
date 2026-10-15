import fs from 'node:fs';
import path from 'node:path';

import type { AssessmentItem, Blueprint } from '../config';
import { applicationKey } from '../lifecycle';
import {
  renderMissingDoctorIdentity, renderDoctorCheck, renderDoctorReport,
} from '../operational-contract';
import type { ProjectState } from '../project';
import { BASELINE_FILE, parseBaseline, splitByBaseline } from './baseline';
import { findingIdentity } from './types';
import type { DoctorCheck, Finding } from './types';
import type { DoctorResult, DoctorVerdict } from './doctor';
import type { ArchitectureFacts } from './facts';
import type { ProhibitionEvidence } from './prohibition-wiring';
import { deriveAdoptionAssessment } from './adoption-assessment';
import { architectureAssessmentItems } from './adoption-assessment-architecture';

export function assessmentApplication(root: string, state: ProjectState): string {
  return applicationKey(state.repositoryRoot ?? root, root);
}

export function assessmentBaseline(root: string, findings: Finding[]) {
  const file = path.join(root, BASELINE_FILE);
  const recorded = fs.existsSync(file) ? parseBaseline(fs.readFileSync(file, 'utf-8')) : [];
  const split = splitByBaseline(findings, recorded);
  const fresh = new Set(split.fresh.map(findingIdentity));

  return { ...split, debt: findings.filter((finding) => !fresh.has(findingIdentity(finding))) };
}

export function doctorAssessmentItems(
  application: string, checks: DoctorCheck[],
): AssessmentItem[] {
  return checks.map((check) => {
    if (check.sourceKey === undefined) {
      throw new Error(renderMissingDoctorIdentity());
    }

    return {
      id: 'doctor-check', application, sourceKey: check.sourceKey, subject: check.label,
      lane: 'gate', status: !check.ok ? 'failed' : check.skipped ? 'unverified' : 'passed',
      claim: check.label, source: 'doctor-check', evidence: check, reach: null,
      limitations: check.skipped ? [check.skipped] : [], signals: [],
      affectsExit: !check.ok, nextStep: check.skipped ?? check.detail ?? null,
    };
  });
}

export function noConfigResult(
  application: string,
  log: (message: string) => void,
  json?: boolean,
): DoctorResult {
  const checks: DoctorCheck[] = [
    renderDoctorCheck({ kind: 'config', present: false }),
  ];

  const assessment = deriveAdoptionAssessment('current-config-adoption',
    doctorAssessmentItems(application, checks));

  log(renderDoctorReport(checks, { json, assessment }));

  return { ok: false, verdict: verdictOf(checks), gateVerdict: verdictOf(checks),
    assessment, workflowAssessments: [], checks };
}

export function verdictOf(checks: DoctorCheck[]): DoctorVerdict {
  if (checks.some((check) => !check.ok)) {
    return 'incomplete';
  }

  return checks.some((check) => check.skipped) ? 'unverified' : 'complete';
}

export function assembleDoctorAssessment(
  root: string, state: ProjectState,
  input: { blueprint: Blueprint; facts: ArchitectureFacts;
    checks: DoctorCheck[]; prohibitions: ProhibitionEvidence[]; },
) {
  const { blueprint, facts, checks, prohibitions } = input;
  const application = assessmentApplication(root, state);
  const baseline = assessmentBaseline(root, facts.findings);

  return deriveAdoptionAssessment('current-config-adoption', [
    ...architectureAssessmentItems({ application, blueprint, facts,
      findings: baseline.fresh, suppressed: baseline.debt, prohibitions }),
    ...doctorAssessmentItems(application, checks),
  ]);
}

export function inspectAssessmentBaseline(
  root: string, findings: Finding[], requireBaseline: boolean,
) {
  try {
    return { ...assessmentBaseline(root, findings), error: null };
  } catch (error) {
    if (requireBaseline) {
      throw error;
    }

    return { fresh: findings, debt: [], suppressed: 0, stale: 0,
      error: error instanceof Error ? error.message : String(error) };
  }
}
