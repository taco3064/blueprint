import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createJiti } from 'jiti';

export function timingSummary(durations) {
  const sorted = [...durations].sort((left, right) => left - right);
  const middle = sorted.length / 2;

  return {
    medianMs: (sorted[Math.floor(middle)] + sorted[Math.ceil(middle) - 1]) / 2,
    slowestMs: sorted.at(-1),
  };
}

function counts(scanResult, outsideScope) {
  const outside = 'inventoryFiles' in outsideScope ? outsideScope : {};

  return {
    governed: scanResult.governedWork,
    outside: {
      inventoryFiles: outside.inventoryFiles ?? 0,
      readFiles: outside.readFiles ?? 0,
      parsedFiles: outside.parsedFiles ?? 0,
      directoryWalks: outside.directoryWalks ?? 0,
      testFilesExcluded: outside.testFilesExcluded ?? 0,
      contributions: outside.contributions ?? {},
    },
    inventoryMode: outsideScope.inventoryMode ?? 'none',
    scopeStatus: outsideScope.status,
    outsidePaths: (outsideScope.files ?? []).map((file) => file.path).sort(),
  };
}

async function loadCollector(codeRoot, legacy) {
  const jiti = createJiti(import.meta.url);

  if (!legacy) {
    const { collectArchitectureFacts } = await jiti.import(path.join(codeRoot, 'src/inspect/facts.ts'));

    return (fixture, demand) => {
      const facts = collectArchitectureFacts(fixture.root, fixture.blueprint, { demand });

      return counts(facts.scanResult, facts.outsideScope);
    };
  }

  const { scan } = await jiti.import(path.join(codeRoot, 'src/inspect/scan.ts'));
  const { analyze } = await jiti.import(path.join(codeRoot, 'src/inspect/analyze.ts'));

  return (fixture) => {
    const result = scan(fixture.root, fixture.blueprint.architecture.sourceRoot);
    const governed = result.files.length;
    const outside = result.outsideFiles?.length ?? 0;

    analyze(result, fixture.blueprint);

    return {
      governed: { inventoryFiles: governed, readFiles: governed, parsedFiles: governed },
      outside: { inventoryFiles: outside, readFiles: outside, parsedFiles: outside },
      inventoryMode: 'legacy-filesystem', scopeStatus: 'legacy-untracked-completeness',
      outsidePaths: (result.outsideFiles ?? []).map((file) => file.path).sort(),
    };
  };
}

export async function measure(spec) {
  const collect = await loadCollector(spec.codeRoot, spec.legacy);
  const warmupCount = 3;
  const measuredRunCount = 10;
  const durations = [];
  let operations;

  for (let index = 0; index < warmupCount + measuredRunCount; index++) {
    const start = performance.now();
    const result = collect(spec.fixture, spec.demand);
    const elapsed = performance.now() - start;

    if (operations) {
      assert.deepEqual(result, operations, 'Operation counts and population must be repeatable');
    }

    operations = result;

    if (index >= warmupCount) {
      durations.push(elapsed);
    }
  }

  return {
    revision: spec.revision, candidateCommit: spec.commit, candidateTree: spec.tree,
    candidateBaseCommit: spec.baseCommit ?? null,
    nodeVersion: process.version, platform: process.platform, architecture: process.arch,
    fixture: spec.fixture.name, demand: spec.demand,
    warmupCount, measuredRunCount, ...timingSummary(durations), durationsMs: durations,
    ...operations,
  };
}

if (process.argv[2] === '--spec') {
  const spec = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

  process.stdout.write(JSON.stringify(await measure(spec)));
}
