import { describe, expect, it } from 'vitest';

import { composeIssue, parseVerdict, problemSections } from './field-run.mjs';

/**
 * The harness's reporting path, which is where three of its four self-inflicted
 * bugs lived: a verdict regex that fell through to the tail, a title scored off
 * doctor's exit code, and three junk issues filed from a run that measured
 * nothing. Every one of them shipped because the only way to see this output was
 * to spend a real run on it — a build, a pack, and up to 45 minutes per scenario.
 * `composeIssue` is pure for that reason, and these are the cases it decides.
 */

const feedback = ({ blocked = 0, invented = 0, withdrawn = 0 } = {}) => [
  '# @kekkai/blueprint 導入體驗 feedback',
  '',
  '## 好用的',
  '',
  '- PRAISE-MARKER: the early-exit checklist was runnable.',
  '',
  '## 卡到的',
  '',
  blocked ? '- BLOCKED-MARKER: `impact` named a package that was installed.' : '沒有。',
  '',
  '### 查證後撤掉',
  '',
  '- WITHDRAWN-MARKER: thought the playbook was too long; it says which part applies.',
  '',
  '## 拿不準的',
  '',
  '### 沒立場，我自己發明',
  '',
  invented ? '- INVENTED-MARKER: no stance on where the contract block goes.' : '沒有。',
  '',
  '### 有立場，我照做',
  '',
  '- FOLLOWED-MARKER: kept the empty layers; inspect calls them runway.',
  '',
  `field-verdict: blocked=${blocked} invented=${invented} withdrawn=${withdrawn}`,
  '',
].join('\n');

const run = (over = {}) => ({
  scenario: 'new',
  agent: 'claude',
  dir: '/tmp/field/new-claude',
  code: 0,
  minutes: '8.1',
  doctor: { code: 0, output: '✓ Adoption complete — all 7 checks passed.\n(not a git repo)' },
  inspect: { code: 0, output: '' },
  feedback: feedback(),
  ...over,
});

const compose = (runs) => composeIssue({
  reportFile: '/tmp/field/report.md',
  runs,
  skipped: [],
  tree: 'abc1234',
  packedVersion: '3.0.0',
});

describe('parseVerdict', () => {
  it('reads the counts the agent declared', () => {
    expect(parseVerdict(feedback({ blocked: 2, invented: 1, withdrawn: 9 })))
      .toEqual({ blocked: 2, invented: 1, withdrawn: 9 });
  });

  it('returns null when the line is absent, because that is not a zero', () => {
    // "cannot tell" and "found nothing" are the two things this harness exists to
    // keep apart — a missing line resolving to zeros would file nothing for a run
    // whose format drifted, and the finding would be lost with the temp dir.
    expect(parseVerdict('## 卡到的\n\n沒有。\n')).toBeNull();
    expect(parseVerdict(null)).toBeNull();
  });

  it('tolerates the spacing and case an agent will actually write', () => {
    expect(parseVerdict('Field-Verdict:  blocked=1   invented=0  withdrawn=3'))
      .toEqual({ blocked: 1, invented: 0, withdrawn: 3 });
  });
});

describe('problemSections', () => {
  it('takes 卡到的 and 沒立場, and stops at each one\'s next heading', () => {
    const sliced = problemSections(feedback({ blocked: 1, invented: 1 }));

    expect(sliced).toContain('BLOCKED-MARKER');
    expect(sliced).toContain('INVENTED-MARKER');
    // The three that are the paper trail, not work. 查證後撤掉 is a SUBSECTION of
    // 卡到的, so a slice that ran to the next `##` would carry it along.
    expect(sliced).not.toContain('WITHDRAWN-MARKER');
    expect(sliced).not.toContain('FOLLOWED-MARKER');
    expect(sliced).not.toContain('PRAISE-MARKER');
  });

  it('returns null when no heading matches, so the caller can paste it whole', () => {
    // Never less than it was given: a slice nobody can tell is short is the same
    // defect as a count nobody can tell is short.
    expect(problemSections('# feedback\n\n## Blockers\n\nsomething real\n')).toBeNull();
  });
});

describe('composeIssue', () => {
  it('files nothing when every scenario is clean — that is the field test passing', () => {
    const outcome = compose([run(), run({ agent: 'codex', feedback: feedback({ withdrawn: 4 }) })]);

    expect(outcome).toEqual({ kind: 'pass', scenarios: 2, withdrawn: 4, unverified: 0 });
  });

  it('counts an unverified doctor as a caveat on the pass, not a finding', () => {
    // `⊘ Adoption unverified` keeps exit 0 by design, and on the codex scenario it
    // is the sandbox's missing registry — judged twice already. It must reach the
    // console, and it must not put a work item in the inbox by itself.
    const outcome = compose([run({
      doctor: { code: 0, output: '⊘ Adoption unverified — 6 of 7 checks passed, 1 could not run' },
    })]);

    expect(outcome).toMatchObject({ kind: 'pass', unverified: 1 });
  });

  it('separates "nothing to fix" from "nothing was measured"', () => {
    expect(compose([run({ feedback: null, code: 1, logTail: 'API Error' })]))
      .toEqual({ kind: 'nothing-measured' });
  });

  it('carries only the two work sections, and names the clean scenarios in one line each', () => {
    const outcome = compose([
      run({ agent: 'codex', feedback: feedback({ blocked: 1, withdrawn: 6 }) }),
      run({ feedback: feedback({ withdrawn: 12 }) }),
    ]);

    expect(outcome.kind).toBe('file');
    expect(outcome.findings).toBe(1);
    expect(outcome.title).toBe(
      'Field run @ abc1234 — 1 finding(s) in 2 scenario(s) · doctor 2/2 green',
    );

    expect(outcome.body).toContain('BLOCKED-MARKER');
    expect(outcome.body).not.toContain('WITHDRAWN-MARKER');
    expect(outcome.body).not.toContain('FOLLOWED-MARKER');
    expect(outcome.body).not.toContain('PRAISE-MARKER');

    // The denominator stays visible, or a two-finding issue reads as the whole run.
    expect(outcome.body).toContain('## Clean scenarios');
    expect(outcome.body).toContain('- ✓ new × claude — doctor green · 0 blocked, 0 invented, 12 withdrawn');
    // And the full account is one path away, said in the issue rather than assumed.
    expect(outcome.body).toContain('/tmp/field/report.md');
  });

  it('files a run whose verdict line is missing, whole', () => {
    const outcome = compose([run({ feedback: '## 卡到的\n\nsomething, unclear how much\n' })]);

    expect(outcome.kind).toBe('file');
    expect(outcome.findings).toBe(0);
    expect(outcome.title).toContain('1 verdict unreadable');
    expect(outcome.body).toContain('verdict line missing');
    expect(outcome.body).toContain('something, unclear how much');
  });

  it('files a red gate even when the agent reported nothing blocked', () => {
    // The agent's count is the contract for its own prose, never for the gates: a
    // doctor that failed is a finding whatever the feedback says, and so is an
    // agent that exited non-zero after writing one.
    expect(compose([run({ doctor: { code: 1, output: '✗ Adoption incomplete' } })]).kind)
      .toBe('file');
    expect(compose([run({ code: 143 })]).kind).toBe('file');
  });

  it('pastes the whole feedback when the headings drifted, and says so', () => {
    const drifted = ['## Blockers', '', 'DRIFT-MARKER', '', 'field-verdict: blocked=1 invented=0 withdrawn=0'].join('\n');
    const outcome = compose([run({ feedback: drifted })]);

    expect(outcome.body).toContain('DRIFT-MARKER');
    expect(outcome.body).toContain('headings did not match the outline');
  });

  it('keeps a staged scenario that never produced feedback in the issue', () => {
    // A partial failure still files — the report copies the failing agent's log
    // tail, which is how an 81-byte "API Error" survived a temp directory once.
    const outcome = compose([
      run({ feedback: feedback({ blocked: 1 }) }),
      run({ agent: 'codex', feedback: null, code: 1, logTail: 'API Error: connection closed' }),
    ]);

    expect(outcome.body).toContain('new × codex — no feedback');
    expect(outcome.body).toContain('API Error: connection closed');
  });
});
