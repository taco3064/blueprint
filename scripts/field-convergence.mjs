import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveCandidate } from './field-candidate.mjs';

export const FIELD_CONTEXT = 'blueprint/field-convergence';

export function matrixComplete(evidence) {
  if (!Array.isArray(evidence.requiredScenarios)
    || !Array.isArray(evidence.scenarios)) return false;

  const required = [...new Set(evidence.requiredScenarios)].sort();
  const actual = [...new Set(evidence.scenarios)].sort();

  return required.length === evidence.requiredScenarios.length
    && actual.length === evidence.scenarios.length
    && JSON.stringify(required) === JSON.stringify(actual);
}

export function releaseBlockerCount(evidence) {
  if (!Array.isArray(evidence.findings)) throw new Error('Field evidence must list findings.');

  if (evidence.findings.some((finding) => typeof finding?.summary !== 'string'
    || typeof finding.classification !== 'string'
    || typeof finding.releaseBlocking !== 'boolean')) {
    throw new Error('Every field finding requires summary, classification, and releaseBlocking.');
  }

  return evidence.findings.filter((finding) => finding.releaseBlocking).length;
}

export function validateReportUrl(reportUrl) {
  let url;

  try {
    url = new URL(reportUrl);
  } catch {
    throw new Error('Field evidence requires a valid durable HTTPS report URL.');
  }

  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error('Field evidence requires a valid durable HTTPS report URL.');
  }

  return url.href;
}

export function convergenceStatus(evidence) {
  validateReportUrl(evidence.reportUrl);

  if (evidence.scope === 'affected') {
    return evidence.result === 'failure'
      ? { state: 'failure', description: 'Affected field replay failed; full convergence is still required.' }
      : { state: 'pending', description: 'Affected replay passed; full field convergence is still required.' };
  }

  if (evidence.scope !== 'full') throw new Error('Field evidence scope must be full or affected.');

  const success = evidence.result === 'success'
    && matrixComplete(evidence)
    && releaseBlockerCount(evidence) === 0;

  return success
    ? { state: 'success', description: 'Exact candidate passed the complete live field matrix.' }
    : { state: 'failure', description: 'Full field convergence failed or is incomplete.' };
}

export function evidenceMarker(evidence) {
  return `<!-- blueprint-field-convergence ${JSON.stringify({
    schemaVersion: 1,
    candidateSha: evidence.candidateSha,
    scope: evidence.scope,
    result: evidence.result,
    matrixComplete: matrixComplete(evidence),
    releaseBlockers: releaseBlockerCount(evidence),
    reportUrl: validateReportUrl(evidence.reportUrl),
  })} -->`;
}

export function parseEvidenceMarker(body) {
  const match = /<!-- blueprint-field-convergence (\{.*\}) -->/.exec(body ?? '');

  return match ? JSON.parse(match[1]) : null;
}

export function renderEvidence(evidence, candidate) {
  const status = convergenceStatus(evidence);

  return [
    `## Field ${evidence.scope === 'full' ? 'convergence' : 'affected replay'} — ${status.state.toUpperCase()}`,
    '',
    `- candidate SHA: \`${evidence.candidateSha}\``,
    `- package: \`@kekkai/blueprint@${candidate.version}\``,
    `- tarball SHA-256: \`${candidate.sha256}\``,
    `- candidate workflow: ${candidate.workflowUrl ?? 'unavailable'}`,
    `- candidate artifact: ${candidate.artifactUrl}`,
    `- scope: ${evidence.scope}`,
    `- matrix complete: ${matrixComplete(evidence)}`,
    `- required scenarios: ${evidence.requiredScenarios.join(', ')}`,
    `- scenarios: ${evidence.scenarios.join(', ')}`,
    `- release blockers: ${releaseBlockerCount(evidence)}`,
    `- repair PRs: ${(evidence.repairPrs ?? []).join(', ') || 'none'}`,
    `- detailed report: ${evidence.reportUrl}`,
    ...(evidence.reason ? [`- replay justification: ${evidence.reason}`] : []),
    '',
    '### Findings',
    '',
    ...(evidence.findings.length
      ? evidence.findings.map((finding) => `- ${finding.releaseBlocking ? 'BLOCKING' : 'NON-BLOCKING'} · ${finding.classification}: ${finding.summary}`)
      : ['- none']),
    '',
    status.description,
    '',
    evidenceMarker(evidence),
  ].join('\n');
}

function gh(args, input) {
  return JSON.parse(execFileSync('gh', ['api', ...args], { input, encoding: 'utf8' }));
}

function record(options) {
  const candidate = resolveCandidate(options.candidate);
  const { manifest } = candidate;
  const evidence = JSON.parse(fs.readFileSync(options.evidence, 'utf8'));

  if (evidence.candidateSha !== manifest.headSha) throw new Error('Field evidence SHA does not match the candidate manifest.');
  if (!Array.isArray(evidence.scenarios) || !evidence.scenarios.length) throw new Error('Field evidence must list executed scenarios.');

  if (!Array.isArray(evidence.requiredScenarios) || !evidence.requiredScenarios.length) {
    throw new Error('Field evidence must list the ticket-authorized required matrix.');
  }

  releaseBlockerCount(evidence);

  if (evidence.scope === 'affected' && !evidence.reason) throw new Error('Affected replay requires an explicit scope justification.');

  const repository = manifest.repository;
  const body = renderEvidence(evidence, { ...manifest, artifactUrl: candidate.artifactUrl });

  const comment = gh([
    '--method', 'POST', `repos/${repository}/issues/${options.issue}/comments`,
    '--input', '-',
  ], JSON.stringify({ body }));

  const status = convergenceStatus(evidence);

  gh([
    '--method', 'POST', `repos/${repository}/statuses/${manifest.headSha}`,
    '-f', `state=${status.state}`,
    '-f', `context=${FIELD_CONTEXT}`,
    '-f', `description=${status.description}`,
    '-f', `target_url=${comment.html_url}`,
  ]);

  return { ...status, targetUrl: comment.html_url };
}

function parse(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 2) {
    if (!rest[index]?.startsWith('--') || rest[index + 1] === undefined) throw new Error(`Unknown or incomplete argument: ${rest[index]}`);
    options[rest[index].slice(2)] = rest[index + 1];
  }

  return { command, options };
}

function main() {
  const { command, options } = parse(process.argv.slice(2));

  if (command !== 'record') throw new Error('Expected record.');
  process.stdout.write(`${JSON.stringify(record(options), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
