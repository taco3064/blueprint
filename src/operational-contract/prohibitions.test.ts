import { deriveAdoptionAssessment } from '../inspect/adoption-assessment';
import { doctorAssessmentItems } from '../inspect/assessment-runtime';
import { describe, expect, it } from 'vitest';
import { resolveArchitecture, resolveProhibitions } from '../config';
import type { ResolvedProhibition } from '../config';
import {
  renderMustNotViolation,
  renderCompactProhibitions,
  renderProhibitionPolicy,
  renderProhibitionScope,
  renderProhibitionDetails,
  renderProhibitionDoctorMessage,
  renderProhibitionLabel,
  renderProhibitionReport,
  renderProhibitionSeverity,
  renderInspectProhibitionOutput,
  parseProhibitionIdentity,
} from './prohibitions';
import { operationalText } from './operational-contract';
import { renderDoctorReport } from './doctor-report';

function fact(): ResolvedProhibition {
  return resolveProhibitions({ name: 'domain', does: 'policy', mustNot: [{
    id: 'render-ui', description: 'render UI', checks: [{ call: 'divIcon' }],
  }] })[0];
}

describe('prohibition report composition', () => {
  it('parses stable diagnostic identity before arbitrary description content', () => {
    const rendered = renderMustNotViolation({
      layer: 'domain', id: 'ui', description: 'text (other); matched check "untrusted"',
    }, { call: 'divIcon' });

    expect(parseProhibitionIdentity(rendered)).toEqual({ layer: 'domain', id: 'ui' });
    expect(parseProhibitionIdentity(`Wrapped diagnostic: ${rendered}`)).toBeNull();
    expect(parseProhibitionIdentity('')).toBeNull();
    expect(parseProhibitionIdentity('Some other diagnostic')).toBeNull();
    expect(parseProhibitionIdentity('Layer "domain" prohibition "": text')).toBeNull();
  });

  it('composes inspect facts at the renderer boundary and preserves empty output', () => {
    const report = operationalText('Architecture report');

    expect(renderInspectProhibitionOutput(report, [])).toBe('Architecture report');

    expect(renderInspectProhibitionOutput(report, [fact()]))
      .toBe(`Architecture report\n${renderProhibitionReport([fact()])}`);
  });

  it('retains supplied doctor facts in JSON without inventing an absent catalog', () => {
    expect(JSON.parse(renderDoctorReport([],
      { assessment: deriveAdoptionAssessment('current-config-adoption',
        doctorAssessmentItems('.', [])), json: true }))).not.toHaveProperty('prohibitions');

    expect(JSON.parse(renderDoctorReport([],
      { assessment: deriveAdoptionAssessment('current-config-adoption',
        doctorAssessmentItems('.', [])), json: true, prohibitions: [] })).prohibitions)
      .toEqual([]);

    expect(JSON.parse(renderDoctorReport([],
      { assessment: deriveAdoptionAssessment('current-config-adoption',
        doctorAssessmentItems('.', [])), json: true, prohibitions: [fact()] })).prohibitions)
      .toEqual([fact()]);
  });
});

it('uses explicit framework and severity while resolving compact detector availability', () => {
  const architecture = { alias: '@', layers: [{
    name: 'domain', does: 'policy', mustNot: [{
      id: 'state', description: 'own state', checks: [{ capability: 'react-state' as const }],
    }],
  }] };

  const blueprint = { framework: 'react' as const, architecture,
    emit: { lint: { severity: 'warn' as const } } };

  const explicit = renderCompactProhibitions(blueprint, 'vue').join('\n');

  expect(explicit).toContain('severity warn');
  expect(explicit).toContain('lint backed; available detectors');
  expect(explicit).not.toContain('Requires resolved react framework support.');

  const automatic = { ...blueprint, framework: 'auto' as const };

  expect(renderCompactProhibitions(automatic, 'react').join('\n'))
    .toContain('lint backed; available detectors');

  expect(renderCompactProhibitions(automatic, 'vue').join('\n'))
    .toContain('Requires resolved react framework support.');

  expect(renderCompactProhibitions(automatic).join('\n'))
    .toContain('Requires resolved react framework support.');
});

describe('prohibition explanation authority', () => {
  it('omits executable policy when all declarations are review-only', () => {
    const architecture = { alias: '@', layers: [{
      name: 'domain', does: 'policy', mustNot: ['render UI'],
    }] };

    expect(renderProhibitionPolicy(resolveArchitecture(architecture))).toEqual([]);
    expect(renderCompactProhibitions({ framework: 'react', architecture })).toEqual([]);
  });

  it('names exact matched checks and distinguishes project call syntax from identity', () => {
    expect(renderMustNotViolation({ layer: 'domain', id: 'render-ui', description: 'render UI' },
      { call: 'divIcon' }))
      .toBe('Layer "domain" prohibition "render-ui": must not render UI; '
        + 'matched check {"call":"divIcon"}. '
        + 'This project-declared syntactic call check matches the terminal name, '
        + 'not semantic identity. Move this behavior to a permitted layer or ask '
        + 'the architecture owner to revise the constraint.');

    expect(renderMustNotViolation({ layer: 'domain', id: 'net', description: 'use network' },
      { global: 'fetch' }))
      .not.toContain('syntactic');
  });

  it('renders review-only prose without creating carrier or executable details', () => {
    const review = resolveProhibitions({
      name: 'domain', does: 'policy', mustNot: ['render UI'],
    })[0];

    expect(renderProhibitionLabel(review)).toBe('render UI [review only; no machine carrier]');
    expect(renderProhibitionDetails(review)).toBe(renderProhibitionLabel(review));
  });

  it.each(['active', 'partial', 'unavailable'] as const)('explains %s availability', (status) => {
    const text = renderProhibitionLabel({ ...fact(), status, severity: 'warn' });

    expect(text).toContain('render-ui: render UI');
    expect(text).toContain('severity warn');

    expect(text).toContain(status === 'active'
      ? 'lint backed; available detectors; effective lint wiring must be verified separately'
      : `${status}; gate evidence unverified; adoption completion blocked`);
  });

  it('renders ordered checks, unavailable reason, exact limits, and entry exemptions', () => {
    const prohibition = resolveProhibitions({ name: 'domain', does: 'policy', mustNot: [{
      id: 'render-ui', description: 'render UI', checks: [
        { call: 'divIcon' }, { capability: 'react-state' },
      ], exempt: ['src/domain/allowed.ts'],
    }] })[0];

    const text = renderProhibitionDetails(prohibition);

    expect(text.indexOf('{"call":"divIcon"}')).toBeLessThan(text.indexOf('react-state'));
    expect(text).toContain('unavailable (Requires resolved react framework support.)');
    expect(text).toContain('entry exemptions: src/domain/allowed.ts');
    expect(text).toContain('checks use OR semantics');
    expect(text).toContain('not semantic identity proof');
    expect(renderProhibitionDetails(fact())).toContain('entry exemptions: (none)');
  });

  it('states every severity and uncertainty boundary', () => {
    const text = renderProhibitionSeverity();

    expect(text).toContain('Error-severity executable matches are proven blocking violations');

    expect(text)
      .toContain('Warn-severity matches are visible non-blocking conformance observations');

    expect(text).toContain('affectsExit: false');
    expect(text).toContain('Partial or unavailable detectors yield unverified evidence');
    expect(text).toContain('without inventing a violation or a new CLI exit policy');
    expect(text).toContain('required carrier is failed even at warn severity');
  });

  it('renders report defaults and measured facts without inventing source evidence', () => {
    expect(renderProhibitionReport([])).toBe('');
    const defaults = renderProhibitionReport([fact()]);

    expect(defaults).toContain('domain: render-ui: render UI');
    expect(defaults).toContain('reach: unmeasured; lint integration: unverified');
    expect(defaults).toContain('files: (unmeasured); ignores: (none)');
    expect(defaults).not.toContain('; gate:');

    const measured = renderProhibitionReport([{
      ...fact(), position: 'shop/domain', reach: 'covered', lintIntegration: 'verified',
      gate: 'passed', affectsExit: false, files: ['src/shop/domain/**'], ignores: ['**/*.test.ts'],
      reason: 'Exact carrier verified.',
    }]);

    expect(measured).toContain('shop/domain: render-ui: render UI');

    expect(measured).toContain('reach: covered; lint integration: verified; '
      + 'gate: passed; affectsExit: false');

    expect(measured).toContain('files: src/shop/domain/**; ignores: **/*.test.ts');
    expect(measured).toContain('Exact carrier verified.');
    expect(measured).toContain('Static declarations do not establish a live source violation.');
  });

  it('explains Doctor evidence with actual facts and fallback instructions', () => {
    expect(renderProhibitionDoctorMessage(fact())).toBe('domain / render-ui: render UI; '
      + 'availability active; gate unverified; lint integration unverified. '
      + 'Verify the exact normalized checks in the effective ESLint configuration. '
      + 'Checks: {"call":"divIcon"}: available.');

    expect(renderProhibitionDoctorMessage({
      ...fact(), position: 'shop/domain', id: null, gate: 'failed',
      lintIntegration: 'missing', reason: 'Required rule was disabled.',
    })).toBe('shop/domain / review-only: render UI; availability active; gate failed; '
      + 'lint integration missing. Required rule was disabled. '
      + 'Checks: {"call":"divIcon"}: available.');
  });

  it('names the exact unavailable check and reason in Doctor output', () => {
    const unavailable = resolveProhibitions({ name: 'domain', does: 'policy', mustNot: [{
      id: 'state', description: 'own state', checks: [{ capability: 'react-state' }],
    }] })[0];

    expect(renderProhibitionDoctorMessage(unavailable))
      .toContain('Checks: {"capability":"react-state"}: unavailable '
        + '(Requires resolved react framework support.).');
  });
});

describe('prohibition policy and scope selection', () => {
  const resolved = resolveArchitecture({
    alias: '@',
    layers: [
      { name: 'views', does: 'present UI' },
      { name: 'domain', does: 'policy', mustNot: [
        'avoid presentation coupling',
        { id: 'ui', description: 'render UI', checks: [{ call: 'divIcon' }] },
      ] },
    ],
  });

  it('retains executable policy among unconstrained layers and review-only entries', () => {
    expect(renderProhibitionPolicy(resolved)).toEqual([renderProhibitionSeverity()]);
  });

  it('reports the selected layer scope even when the first layer has no prohibition', () => {
    expect(renderProhibitionScope(resolved, 'domain')).toContain('Governed files: src/domain/');
    expect(renderProhibitionScope(resolved, 'views')).toBe('');
  });
});

it('renders an unmeasured report without inventing an exit result or reason line', () => {
  const defaults = renderProhibitionReport([fact()]);

  expect(defaults.split('\n')).toEqual([
    'Must-not prohibitions',
    renderProhibitionSeverity(),
    `  domain: ${renderProhibitionDetails(fact())}`,
    '    reach: unmeasured; lint integration: unverified',
    '    files: (unmeasured); ignores: (none)',
    'Covered reach measures governed files, not absence of prohibited behavior. '
    + 'Vacuous positions and module runway are not behavioral protection. '
    + 'Static declarations do not establish a live source violation.',
  ]);
});
