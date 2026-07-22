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

// Must match the filename the prompt file names — the prompt is the single
// source (scripts/field-prompt.md), shared verbatim with manual field runs.
const FEEDBACK_FILE = 'blueprint-field-feedback.md';

const PROMPT = [
  // Harness-specific context on top of the shared prompt: the tarball is
  // pre-installed, so the agent must never reach for the registry.
  'Context: @kekkai/blueprint is ALREADY installed in this repo (from a local',
  'tarball) — do not install it from the registry. This repo is disposable.',
  '',
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

function stageRepo(dir, source) {
  // A local clone, so the run can never touch the real repo.
  sh(`git clone --local --quiet "${source}" "${dir}"`, ROOT);
  sh('npm install --no-audit --no-fund', dir);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const agents = (args.agents ?? Object.keys(AGENT_COMMANDS)).filter((agent) => {
    if (hasBinary(AGENT_COMMANDS[agent]('x')[0])) return true;

    console.log(`⚠ ${agent}: CLI not found on this machine — skipped.`);

    return false;
  });

  if (!agents.length) throw new Error('no agent CLI available — nothing to run.');

  const scenarios = ['new', ...(args.repo ? ['repo'] : [])];

  console.log('▸ building and packing the local tree (no publish involved)');
  sh('npm run build', ROOT);

  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-field-'));
  const packOut = execSync(`npm pack --pack-destination "${workRoot}"`, {
    cwd: ROOT,
    encoding: 'utf-8',
  }).trim().split('\n').pop();
  const tarball = path.join(workRoot, packOut);

  const runs = [];

  for (const scenario of scenarios) {
    for (const agent of agents) {
      const dir = path.join(workRoot, `${scenario}-${agent}`);

      console.log(`\n▸ staging ${scenario} × ${agent} — ${dir}`);
      fs.mkdirSync(dir, { recursive: true });

      if (scenario === 'new') stageNew(dir);
      else stageRepo(dir, args.repo);

      sh(`npm install -D --no-audit --no-fund "${tarball}"`, dir);

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

      runs.push({
        scenario,
        agent,
        dir,
        ...result,
        doctor,
        inspect,
        feedback: fs.existsSync(feedbackPath) ? fs.readFileSync(feedbackPath, 'utf-8') : null,
      });
    }
  }

  const report = [
    `# blueprint field run — ${new Date().toISOString()}`,
    '',
    `tarball: ${tarball}`,
    '',
    ...runs.flatMap((run) => {
      if (run.dry) return [`## ${run.scenario} × ${run.agent} — staged only (--dry): ${run.dir}`, ''];

      const doctorLine = run.doctor.output.trim().split('\n').pop();

      return [
        `## ${run.scenario} × ${run.agent}`,
        '',
        `- dir: ${run.dir}`,
        `- agent exit ${run.code} after ${run.minutes}m (full log: agent.log)`,
        `- doctor exit ${run.doctor.code} — ${doctorLine}`,
        `- inspect --baseline exit ${run.inspect.code}`,
        '',
        `### feedback (${FEEDBACK_FILE})`,
        '',
        run.feedback ?? '(missing — the agent never wrote it; read agent.log)',
        '',
      ];
    }),
  ].join('\n');

  const reportFile = path.join(workRoot, 'report.md');

  fs.writeFileSync(reportFile, report);
  console.log(`\n✓ field run complete — report: ${reportFile}`);

  for (const run of runs) {
    if (!run.dry) {
      console.log(`  ${run.scenario} × ${run.agent}: agent ${run.code === 0 ? '✓' : `✗(${run.code})`} · doctor ${run.doctor.code === 0 ? '✓' : '✗'} · inspect ${run.inspect.code === 0 ? '✓' : '✗'}`);
    }
  }

  if (args.issue && !args.dry) fileIssue(reportFile, runs);
  else if (args.issue) console.log('  (dry) no issue filed');
}

/**
 * File the report as the triage inbox — a `field-run` GitHub issue. Never
 * fails the run: without gh (or auth) the report simply stays local.
 */
function fileIssue(reportFile, runs) {
  if (!hasBinary('gh')) {
    console.log('⚠ gh CLI not found — report stays local (re-run with --no-issue to silence this).');

    return;
  }

  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version;
  const matrix = runs.map((run) => `${run.scenario}×${run.agent}`).join(', ');
  const title = `Field run v${version}: ${matrix}`;

  const body = [
    '> Filed automatically by `scripts/field-run.mjs` against the local,',
    '> unpublished tree. Triage flow: consolidate the findings below,',
    '> judge each item (fix / by-design / reject), land fixes with their',
    '> conformance fixtures, then close this issue referencing the commits.',
    '',
    fs.readFileSync(reportFile, 'utf-8'),
  ].join('\n').slice(0, 60000);

  const bodyFile = path.join(path.dirname(reportFile), 'issue-body.md');

  fs.writeFileSync(bodyFile, body);

  try {
    execSync('gh label create field-run --color 0E8A16 --description "Automated adoption field run" 2>/dev/null || true', { cwd: ROOT, shell: '/bin/sh', stdio: 'ignore' });

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
