#!/usr/bin/env node
/**
 * The field harness — automates the publish → adopt → collect-feedback loop
 * that used to be run by hand, four times per release.
 *
 *   node scripts/field-run.mjs                      # new-project scenario, every available agent
 *   node scripts/field-run.mjs --repo ../miniapp    # + existing-repo scenario (cloned, never touched)
 *   node scripts/field-run.mjs --agents claude      # limit the agent matrix
 *   node scripts/field-run.mjs --dry                # prep repos + print commands, spawn nothing
 *   node scripts/field-run.mjs --no-issue           # keep the report local, file nothing
 *
 * What it does: builds and packs the LOCAL tree (no publish needed), stages
 * each scenario in a throwaway temp dir, installs the tarball, runs the
 * adoption prompt through each agent CLI headlessly, then verifies with the
 * real doctor/inspect and collects the structured feedback file the prompt
 * asks the agent to write. Everything lands in one report.md — and, unless
 * --no-issue, in a `field-run` GitHub issue, which is the triage inbox: the
 * findings get consolidated, judged, and fixed from there, and the closed
 * issue becomes the public record of what shaped the release.
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_TIMEOUT_MS = 45 * 60 * 1000;

/** Headless invocations per agent — edit here when a CLI changes its flags. */
const AGENT_COMMANDS = {
  claude: (prompt) => ['claude', '-p', prompt, '--dangerously-skip-permissions'],
  codex: (prompt) => ['codex', 'exec', '--full-auto', prompt],
};

/**
 * Why an installed CLI still cannot run here. `hasBinary` answers "is it on
 * PATH", which is a different question: Claude Code refuses to start inside
 * another Claude Code session, and that refusal lands only after a full build, a
 * pack and one install per scenario — three runs launched from a session filed
 * three issues whose every row read `agent exit 1 after 0.0m`. Checked beside
 * the `--repo` validation, for its reason: before any expensive work.
 */
const AGENT_BLOCKERS = {
  claude: () => (process.env.CLAUDECODE
    ? 'cannot launch inside a Claude Code session (CLAUDECODE is set) — run the harness '
      + 'from a plain shell. Unsetting the variable is the CLI\'s own escape hatch, and its '
      + 'warning that nested sessions crash both is the reason not to reach for it here.'
    : null),
};

// Must match the filename the prompt file names — the prompt is the single
// source (scripts/field-prompt.md), shared verbatim with manual field runs.
const FEEDBACK_FILE = 'blueprint-field-feedback.md';

// Mirrors the package's own CONFIG_FILE. Hardcoded rather than imported: this
// script runs before the build it is about to make, so it must not depend on
// dist/ existing.
const CONFIG_FILE = 'blueprint.config.mjs';

const PROMPT = [
  // Harness-specific context on top of the shared prompt: the tarball is
  // pre-installed, so the agent must never reach for the registry.
  'Context: @kekkai/blueprint is ALREADY installed in this repo (from a local',
  'tarball) — do not install it from the registry. This repo is disposable.',
  '',
  // field-prompt.md is deliberately the homepage's one-line paste plus the
  // feedback ask — nothing more. The acceptance gates, the "execute to the
  // end, autonomously, early exit = completion" framing all come from the
  // tool's OWN output now (init's instruct note + blueprint-authoring.md).
  // Re-adding them here would prop up the playbook and stop this harness from
  // testing what a real adopter actually pastes — leave the instruction thin.
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'field-prompt.md'), 'utf-8').trim(),
].join('\n');

/** The starter fixture — the vite + TS shape every field batch adopted on. */
const STARTER_FILES = {
  'package.json': JSON.stringify(
    {
      name: 'field-starter',
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' },
      dependencies: { react: '^18.3.0', 'react-dom': '^18.3.0' },
      devDependencies: {
        '@types/react': '^18.3.0',
        '@types/react-dom': '^18.3.0',
        '@vitejs/plugin-react': '^4.3.0',
        typescript: '~5.6.0',
        vite: '^6.0.0',
      },
    },
    null,
    2,
  ),
  // Comment-bearing JSONC on purpose — the shape that broke batch 10.
  'tsconfig.json': `{
  // template-style comments — part of the fixture, do not remove
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
  },
  "include": ["src"],
}
`,
  'vite.config.ts': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`,
  'index.html': '<!doctype html><div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
  'src/main.tsx': `import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)
`,
  'src/App.tsx': `export function App() {
  return <h1>field starter</h1>
}
`,
};

function parseArgs(argv) {
  const args = { agents: null, repo: null, dry: false, issue: true };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--agents') args.agents = argv[++i].split(',');
    else if (argv[i] === '--repo') args.repo = path.resolve(argv[++i]);
    else if (argv[i] === '--dry') args.dry = true;
    else if (argv[i] === '--no-issue') args.issue = false;
    else throw new Error(`unknown flag: ${argv[i]}`);
  }

  return args;
}

function hasBinary(name) {
  try {
    execSync(`command -v ${name}`, { stdio: 'ignore', shell: '/bin/sh' });

    return true;
  } catch {
    return false;
  }
}

function sh(command, cwd) {
  console.log(`  $ ${command}`);
  execSync(command, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
}

/** Run an agent CLI, streaming to the console while capturing to a log file. */
function runAgent(argv, cwd, logFile) {
  return new Promise((resolve) => {
    const started = Date.now();
    const log = fs.createWriteStream(logFile);
    const child = spawn(argv[0], argv.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

    const tee = (stream) =>
      stream.on('data', (chunk) => {
        process.stdout.write(chunk);
        log.write(chunk);
      });

    tee(child.stdout);
    tee(child.stderr);

    const timer = setTimeout(() => child.kill('SIGKILL'), AGENT_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      log.end();
      resolve({ code, minutes: ((Date.now() - started) / 60000).toFixed(1) });
    });
  });
}

function capture(command, cwd) {
  try {
    return { code: 0, output: execSync(command, { cwd, encoding: 'utf-8', stdio: 'pipe' }) };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

function stageNew(dir) {
  for (const [rel, content] of Object.entries(STARTER_FILES)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
}

/** Directories a clone would never carry — skipped by the copy fallback. */
const COPY_SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
]);

function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (COPY_SKIP.has(entry.name)) continue;

      copyTree(path.join(source, entry.name), path.join(target, entry.name));
    } else if (entry.isFile()) {
      fs.copyFileSync(path.join(source, entry.name), path.join(target, entry.name));
    }
  }
}

/**
 * The staged repo's package manager, from its lockfile — a repo guarding
 * itself with `only-allow pnpm` kills a hardcoded npm install at preinstall.
 */
function packageManagerOf(dir) {
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(dir, 'bun.lockb'))) return 'bun';

  return 'npm';
}

const INSTALL = {
  npm: { deps: 'npm install --no-audit --no-fund', add: (tar) => `npm install -D --no-audit --no-fund "${tar}"` },
  pnpm: { deps: 'pnpm install', add: (tar) => `pnpm add -D "${tar}"` },
  yarn: { deps: 'yarn install', add: (tar) => `yarn add -D "${tar}"` },
  bun: { deps: 'bun install', add: (tar) => `bun add -d "${tar}"` },
};

function stageRepo(dir, source) {
  // Either way the run works on its own copy — the real repo is never touched.
  if (fs.existsSync(path.join(source, '.git'))) {
    sh(`git clone --local --quiet "${source}" "${dir}"`, ROOT);
  } else {
    // A plain project folder that was never `git init`-ed (git clone would
    // misleadingly report it "does not exist") — copy the tree instead.
    console.log(`  (${source} has no .git — copying the tree instead of cloning)`);
    copyTree(source, dir);
  }

  sh(INSTALL[packageManagerOf(dir)].deps, dir);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Fail BEFORE any expensive work: a bad --repo used to surface only at
  // clone time — after the new-project scenario had already burned minutes
  // of agent time, and the crash took the whole run's report with it. A
  // git repo is not required (plain folders are copied), a project is.
  if (args.repo && !fs.existsSync(path.join(args.repo, 'package.json'))) {
    throw new Error(
      `--repo ${args.repo} has no package.json — not an adoptable project; check the path.`,
    );
  }

  const agents = (args.agents ?? Object.keys(AGENT_COMMANDS)).filter((agent) => {
    if (!hasBinary(AGENT_COMMANDS[agent]('x')[0])) {
      console.log(`⚠ ${agent}: CLI not found on this machine — skipped.`);

      return false;
    }

    const blocker = AGENT_BLOCKERS[agent]?.();

    if (blocker) {
      console.log(`⚠ ${agent}: ${blocker}`);

      return false;
    }

    return true;
  });

  if (!agents.length) {
    throw new Error('no agent CLI can run here — nothing to run; the reason per agent is above.');
  }

  const scenarios = ['new', ...(args.repo ? ['repo'] : [])];

  console.log('▸ building and packing the local tree (no publish involved)');
  sh('npm run build', ROOT);

  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-field-'));
  const packOut = execSync(`npm pack --pack-destination "${workRoot}"`, {
    cwd: ROOT,
    encoding: 'utf-8',
  }).trim().split('\n').pop();
  const tarball = path.join(workRoot, packOut);

  // The honest identifier of what was tested: the commit, never the package
  // version (that stays at the LAST release until changesets bump it) — and
  // read HERE, at pack time. Agents run for half an hour; a fix committed
  // mid-run must not be credited with this tarball (run #11 measured
  // fc3b5b0's tarball but was titled f79d7cb — the report-time read).
  const sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim();
  const dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf-8' }).trim() ? '*' : '';
  const tree = `${sha}${dirty}`;

  // Version read at pack time too — and never labeled "last published":
  // between `changeset version` and the actual publish, package.json holds
  // a version that is bumped but NOT released (run #16's header claimed
  // "last published v2.0.0" while 2.0.0 existed only as a commit).
  const packedVersion = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'),
  ).version;

  const runs = [];

  for (const scenario of scenarios) {
    for (const agent of agents) {
      const dir = path.join(workRoot, `${scenario}-${agent}`);

      console.log(`\n▸ staging ${scenario} × ${agent} — ${dir}`);
      fs.mkdirSync(dir, { recursive: true });

      // One scenario failing to stage must not take the completed runs'
      // results down with it — record the failure as a row and move on.
      try {
        if (scenario === 'new') stageNew(dir);
        else stageRepo(dir, args.repo);

        sh(INSTALL[packageManagerOf(dir)].add(tarball), dir);
      } catch (error) {
        console.log(`✗ staging failed: ${error.message.split('\n')[0]}`);
        runs.push({ scenario, agent, dir, staging: error.message.split('\n')[0] });
        continue;
      }

      // Measured before the agent runs, because doctor cannot tell afterwards whose
      // work it is verifying. A `--repo` cloned from an already-adopted project hands
      // doctor a config it did not write, so the gate goes green on the PRIOR adoption
      // — and a run whose agent never finished then reports "Adoption complete" for
      // work it did not do. Same move as the tool's own `hadClaudeDir`: measure the
      // starting state, or the verdict has no owner.
      const preAdopted = fs.existsSync(path.join(dir, CONFIG_FILE));

      const argv = AGENT_COMMANDS[agent](PROMPT);

      if (args.dry) {
        const preview = argv.map((part) => (part === PROMPT ? "'<prompt>'" : part)).join(' ');

        console.log(`  (dry) would run: ${preview}`);
        runs.push({ scenario, agent, dir, dry: true });
        continue;
      }

      console.log(`▸ running ${agent} (timeout ${AGENT_TIMEOUT_MS / 60000}m) …`);

      const result = await runAgent(argv, dir, path.join(dir, 'agent.log'));

      // Verify with the real gates — never take the agent's word for it.
      const doctor = capture('npx blueprint doctor', dir);
      const inspect = capture('npx blueprint inspect --baseline', dir);
      const feedbackPath = path.join(dir, FEEDBACK_FILE);
      const logPath = path.join(dir, 'agent.log');

      // The log's tail is copied into the report ONLY when the feedback is missing,
      // because that is the one case the report cannot explain on its own. Pointing at
      // agent.log instead is a pointer into a temp dir the triage will not have: these
      // are staged under os.tmpdir() and earlier batches were already gone by the time
      // anyone read the issue. The answer for the first non-zero exit in this harness's
      // life was 81 bytes long ("API Error: Connection closed mid-response") and would
      // have been lost with the directory.
      const tail = (file, lines) => {
        if (!fs.existsSync(file)) return null;

        const all = fs.readFileSync(file, 'utf-8').trimEnd().split('\n');

        return all.slice(-lines).join('\n');
      };

      runs.push({
        scenario,
        agent,
        dir,
        preAdopted,
        ...result,
        doctor,
        inspect,
        feedback: fs.existsSync(feedbackPath) ? fs.readFileSync(feedbackPath, 'utf-8') : null,
        logTail: fs.existsSync(feedbackPath) ? null : tail(logPath, 20),
      });
    }
  }

  const report = [
    `# blueprint field run — ${new Date().toISOString()}`,
    '',
    `tree: ${tree} (unreleased tree; tarball packed as v${packedVersion})`,
    `tarball: ${tarball}`,
    '',
    ...runs.flatMap((run) => {
      if (run.dry) return [`## ${run.scenario} × ${run.agent} — staged only (--dry): ${run.dir}`, ''];

      if (run.staging) {
        return [`## ${run.scenario} × ${run.agent} — staging failed, agent never ran`, '', `> ${run.staging}`, ''];
      }

      // The VERDICT line, not the last line. Doctor's banner now carries a note
      // under it when the repo has no version control, and taking the tail made this
      // summary report the caveat instead of the outcome — which is what the previous
      // field batch's own issue titles show. Appending after a conclusion breaks every
      // reader that assumed the conclusion came last; this one was mine.
      const lines = run.doctor.output.trim().split('\n');
      const doctorLine = lines.find((line) => /^[✓✗] Adoption/.test(line.trim()))
        ?? lines[lines.length - 1];

      return [
        `## ${run.scenario} × ${run.agent}`,
        '',
        `- dir: ${run.dir}`,
        `- agent exit ${run.code} after ${run.minutes}m (full log: agent.log)`,
        `- doctor exit ${run.doctor.code} — ${doctorLine}${doctorOwner(run)}`,
        `- inspect --baseline exit ${run.inspect.code}`,
        '',
        `### feedback (${FEEDBACK_FILE})`,
        '',
        run.feedback ?? [
          '(missing — the agent never wrote it. Last 20 lines of agent.log, copied here',
          'because the staging directory is temporary and will not survive triage:)',
          '',
          '```',
          run.logTail ?? '(agent.log absent too — the agent never started)',
          '```',
        ].join('\n'),
        '',
      ];
    }),
  ].join('\n');

  const reportFile = path.join(workRoot, 'report.md');

  fs.writeFileSync(reportFile, report);
  console.log(`\n✓ field run complete — report: ${reportFile}`);

  for (const run of runs) {
    if (run.staging) {
      console.log(`  ${run.scenario} × ${run.agent}: ✗ staging failed — agent never ran`);
    } else if (!run.dry) {
      console.log(`  ${run.scenario} × ${run.agent}: agent ${run.code === 0 ? '✓' : `✗(${run.code})`} · doctor ${run.doctor.code === 0 ? '✓' : '✗'}${run.preAdopted ? ' (repo arrived adopted)' : ''} · inspect ${run.inspect.code === 0 ? '✓' : '✗'}${run.feedback ? '' : ' · no feedback'}`);
    }
  }

  if (args.issue && !args.dry) fileIssue(reportFile, runs, tree);
  else if (args.issue) console.log('  (dry) no issue filed');
}

/**
 * Whose work doctor's verdict is about. A `--repo` staged from an already-adopted
 * project is the harness's most productive scenario — the re-adoption path is where
 * the last two batches found their real defects — so the answer is never to drop the
 * repo. It is to say what the green covers, because an effect stated without its cause
 * reads as a claim: "Adoption complete" beside an agent that never started is this
 * harness making the mistake it exists to catch.
 */
function doctorOwner(run) {
  if (!run.preAdopted) return '';

  return run.code === 0
    ? ' — NOTE: the staged repo arrived already adopted (the re-adoption path), so read'
      + ' this against the agent\'s own account of what it re-authored'
    : ' — NOT this run\'s: the staged repo arrived already adopted and the agent did not'
      + ' finish, so this verdict belongs to the prior config';
}

/**
 * File the report as the triage inbox — a `field-run` GitHub issue. Never
 * fails the run: without gh (or auth) the report simply stays local.
 */
function fileIssue(reportFile, runs, tree) {
  if (!hasBinary('gh')) {
    console.log('⚠ gh CLI not found — report stays local (re-run with --no-issue to silence this).');

    return;
  }

  // Nothing to triage means nothing to file. A run where no scenario produced
  // feedback tested the machine, not the tree, and three such reports went into the
  // inbox as `agent exit 1 after 0.0m` rows that had to be deleted by hand. The
  // diagnosis is not lost with them: each agent's own error is on screen above and in
  // the local report. A run where SOME scenario produced feedback still files — the
  // report copies the failing agent's log tail, which is how an 81-byte "API Error"
  // survived a temp directory once.
  const evidence = runs.filter((run) => run.feedback);

  if (!evidence.length) {
    console.log('⚠ no scenario produced feedback — nothing to triage, so no issue filed.');
    console.log(`  each agent's own error is in the report: ${reportFile}`);

    return;
  }

  const matrix = runs.map((run) => `${run.scenario}×${run.agent}`).join(', ');

  // A visitor scanning the issue list should not have to open one to learn
  // these are release-validation journals, not a bug backlog. The title
  // carries the one fact the harness can state honestly at file time — how
  // many scenarios reached a green doctor (mechanical completion, NOT the
  // triage verdict, which is a human call made later on close).
  // Counted over the scenarios that produced feedback, not over every staged one: a
  // row with no feedback contributes no evidence, and counting its doctor exit made
  // the title overstate what the run measured. Silent scenarios are named instead of
  // dropped, or the matrix and the denominator disagree with no explanation.
  const adopted = evidence.filter((run) => run.doctor?.code === 0).length;
  const silent = runs.filter((run) => !run.dry && !run.staging && !run.feedback).length;
  const scale = ` · doctor ${adopted}/${evidence.length} green`
    + (silent ? ` · ${silent} produced nothing` : '');
  const title = `Field run @ ${tree} — ${matrix}${scale}`;

  const body = [
    '> **A release-validation journal, not a bug report.** The field harness',
    '> (`scripts/field-run.mjs`) runs a real agent CLI through blueprint\'s',
    '> adoption on staged repos, against the local unpublished tree, then files',
    '> the raw feedback here to be triaged in the open. Owner-authored and',
    '> owner-closed by design — the value is the paper trail, not a bug queue:',
    '> what an adopting agent hit, what was judged fix vs by-design vs reject,',
    '> and the commits that closed it. A green doctor above means adoption',
    '> mechanically completed — except where a row says the staged repo arrived',
    '> already adopted, and that row says what its verdict covers. Whether any',
    '> finding was fix-worthy is decided in the triage below.',
    '>',
    '> Triage flow: consolidate the findings, judge each item, land fixes with',
    '> their conformance fixtures, then close referencing the commits.',
    '',
    fs.readFileSync(reportFile, 'utf-8'),
  ].join('\n').slice(0, 60000);

  const bodyFile = path.join(path.dirname(reportFile), 'issue-body.md');

  fs.writeFileSync(bodyFile, body);

  try {
    // The label page is a visitor's aggregate entry point — keep its blurb
    // the "eyeglasses" too, and sync it on an already-existing label (create
    // is a no-op there), not only on first creation.
    const labelDesc = 'Release-validation journal: automated adoption run + open triage';

    execSync(
      `gh label create field-run --color 0E8A16 --description "${labelDesc}" 2>/dev/null `
      + `|| gh label edit field-run --description "${labelDesc}" 2>/dev/null || true`,
      { cwd: ROOT, shell: '/bin/sh', stdio: 'ignore' },
    );

    const url = execSync(
      `gh issue create --title "${title}" --body-file "${bodyFile}" --label field-run`,
      { cwd: ROOT, encoding: 'utf-8' },
    ).trim();

    console.log(`✓ filed as the triage inbox: ${url}`);
  } catch (error) {
    console.log(`⚠ could not file the issue (${error.message.split('\n')[0]}) — report stays local.`);
  }
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
