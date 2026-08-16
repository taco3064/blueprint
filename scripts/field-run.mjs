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
 * asks the agent to write.
 *
 * **Everything lands in one local report.md; only findings land in an issue.**
 * An issue is a list of things to fix, so it carries each agent's 卡到的 and
 * 沒立場 sections and nothing else — what an agent liked, the suspicions it
 * checked and withdrew, and the decisions it took from a stance the tool had
 * already stated are the run's paper trail and stay in the report. **A run that
 * flags nothing files no issue at all: that is the field test passing**, and the
 * console says so. `composeIssue` is the whole decision and is pure, so
 * `field-run.test.mjs` can exercise it without a gh, a network or an agent.
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_TIMEOUT_MS = 45 * 60 * 1000;

/**
 * Headless invocations per agent. Every flag here is a claim about someone
 * else's CLI, so `AGENT_HELP` below checks them before a run spends anything —
 * "edit here when a CLI changes its flags" was the whole mechanism, and codex
 * changed under it: `--full-auto` became a deprecation warning and the trust
 * check started refusing a staged temp dir outright (field run #127, two of four
 * scenarios lost).
 *
 * `--sandbox workspace-write` is what codex's own deprecation notice names.
 * `--skip-git-repo-check` is for where the scenarios live: the `new` fixture is
 * never a git repo, and a `--repo` staged by copy (no `.git` to clone) is not one
 * either.
 */
const AGENT_COMMANDS = {
  claude: (prompt) => ['claude', '-p', prompt, '--dangerously-skip-permissions'],
  codex: (prompt) => [
    'codex', 'exec', '--sandbox', 'workspace-write', '--skip-git-repo-check',
    // The sandbox blocks outbound network by default, so every `npm install` the
    // adoption runs died silently — npm retries without printing, which is the
    // "90 seconds of nothing" eight scenarios across four batches reported as a
    // blueprint defect. It was ours: the claude leg has no sandbox and installed
    // fine on the same machine, in the same runs.
    '-c', 'sandbox_workspace_write.network_access=true',
    prompt,
  ],
};

/**
 * How to ask each CLI what it accepts — the subcommand's own help, since that is
 * where its flags are documented. Verified against both CLIs: the flags above are
 * listed, and the `--full-auto` that broke this run is not, so this check would
 * have caught it before the build.
 */
const AGENT_HELP = {
  claude: ['claude', '--help'],
  codex: ['codex', 'exec', '--help'],
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

/**
 * Why this agent cannot run, or null. Three distinct answers, and all three used to
 * arrive as something other than an answer: an unknown name crashed on
 * `AGENT_COMMANDS[agent] is not a function`, a missing CLI printed one ⚠ and vanished
 * from the record, and a CLI that is installed but cannot launch here was not checked
 * at all.
 */
function unavailable(agent) {
  if (!AGENT_COMMANDS[agent]) {
    return `unknown agent — this harness knows ${Object.keys(AGENT_COMMANDS).join(', ')}`;
  }

  if (!hasBinary(AGENT_COMMANDS[agent]('x')[0])) {
    return `\`${AGENT_COMMANDS[agent]('x')[0]}\` is not on PATH — the CLI is not installed `
      + 'on this machine (a config directory under $HOME is not the CLI)';
  }

  const blocker = AGENT_BLOCKERS[agent]?.();

  if (blocker) return blocker;

  const stale = staleFlags(agent);

  return stale.length
    ? `the invocation passes ${stale.join(', ')}, which \`${AGENT_HELP[agent].join(' ')}\` does `
      + 'not list — the CLI changed under the harness. Fix AGENT_COMMANDS in '
      + 'scripts/field-run.mjs against that help; a run started now spends a build, a pack '
      + 'and an install per scenario before the agent refuses'
    : null;
}

/**
 * Flags this harness passes that the CLI no longer documents. Runs last in
 * `unavailable` because it is the only answer that executes the binary.
 *
 * An inconclusive probe returns nothing rather than blocking: a `--help` that
 * fails or prints nothing proves the flags absent no more than it proves them
 * present, and a check that guesses wrong here stops a run for no reason. Same
 * rule as the tsconfig reader — decline instead of assume.
 */
function staleFlags(agent) {
  const probe = AGENT_HELP[agent];

  if (!probe) return [];

  const help = capture(probe.join(' '), ROOT);

  if (help.code !== 0 || !help.output.trim()) return [];

  return AGENT_COMMANDS[agent]('probe')
    .filter((part) => part.startsWith('-'))
    .filter((flag) => {
      const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Bounded both sides: `-p` must not be matched by `--print` or `-p,`-less
      // prose, and a renamed `--sandbox-mode` must not satisfy `--sandbox`.
      return !new RegExp(`(^|[\\s,'"\`])${escaped}([\\s,='"\`]|$)`, 'm').test(help.output);
    });
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
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      // npm's cache lives in `$HOME/.npm`, which `workspace-write` makes read-only —
      // so even with network allowed the install failed on writing its own cache and
      // logs. Pointing the cache INSIDE the staged repo is what the sandbox is for:
      // measured, a plain `npm install -D eslint@9` goes from silent death to a
      // populated node_modules and an updated manifest. The claude leg is unaffected
      // (it runs unsandboxed) and inherits the same value harmlessly.
      env: { ...process.env, npm_config_cache: path.join(cwd, '.npm-cache') },
    });

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

  const skipped = [];
  const agents = (args.agents ?? Object.keys(AGENT_COMMANDS)).filter((agent) => {
    const reason = unavailable(agent);

    if (!reason) return true;

    console.log(`⚠ ${agent}: ${reason}`);
    skipped.push({ agent, reason });

    return false;
  });

  // An explicit --agents list is a request, and honouring half of it silently is how
  // a whole release's worth of runs looked like a two-agent matrix while only one
  // agent ever ran: the ⚠ above scrolled past at the top of a long log and never
  // reached the report or the issue. Named and unavailable now refuses the run, here,
  // before the build — the default matrix still skips, because there the point is to
  // use whatever this machine has.
  if (args.agents && skipped.length) {
    throw new Error(
      `--agents named ${skipped.length} agent(s) that cannot run here, and a partial matrix `
      + 'answers a request you did not make:\n'
      + skipped.map((entry) => `    ${entry.agent}: ${entry.reason}`).join('\n')
      + '\n  Install it, or name only the agents this machine has.',
    );
  }

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
    // The matrix a reader can see is the one that ran. Without this line, an agent the
    // default matrix dropped leaves no trace at all, and the report reads as though it
    // was never wanted.
    ...skipped.map((entry) => `skipped: ${entry.agent} — ${entry.reason}`),
    '',
    ...runs.flatMap((run) => {
      if (run.dry) return [`## ${run.scenario} × ${run.agent} — staged only (--dry): ${run.dir}`, ''];

      if (run.staging) {
        return [`## ${run.scenario} × ${run.agent} — staging failed, agent never ran`, '', `> ${run.staging}`, ''];
      }

      return [
        `## ${run.scenario} × ${run.agent}`,
        '',
        ...runFacts(run),
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

  if (args.issue && !args.dry) fileIssue({ reportFile, runs, skipped, tree, packedVersion });
  else if (args.issue) console.log('  (dry) no issue filed');
}

/**
 * The four facts about a run that both outputs state — one passage, two call
 * sites, because the local report and the issue disagreeing about a doctor exit
 * would be this harness making the mistake it exists to catch.
 *
 * The VERDICT line, not the last line. Doctor's banner now carries a note under it
 * when the repo has no version control, and taking the tail made this summary
 * report the caveat instead of the outcome — which is what an earlier field
 * batch's own issue titles show. Appending after a conclusion breaks every reader
 * that assumed the conclusion came last; this one was mine.
 *
 * And it broke again the same way: doctor grew a third marker (`⊘`, a check that
 * could not run) and this pattern listed two, so the find missed and the fallback
 * printed the version-control note as the verdict (field run #132's new × codex).
 * Anchoring on the word rather than on a marker list is why it cannot happen a
 * third time — a fourth marker would still match.
 */
function runFacts(run) {
  const lines = run.doctor.output.trim().split('\n');
  const doctorLine = lines.find((line) => /Adoption (complete|unverified|incomplete)/.test(line))
    ?? lines[lines.length - 1];

  return [
    `- dir: ${run.dir}`,
    `- agent exit ${run.code} after ${run.minutes}m (full log: agent.log)`,
    `- doctor exit ${run.doctor.code} — ${doctorLine}${doctorOwner(run)}`,
    `- inspect --baseline exit ${run.inspect.code}`,
  ];
}

/**
 * The agent's own count of what it found, from the last line the prompt makes it
 * write. The harness does not infer it: half the reports open their 卡到的 with
 * "先講結論：沒有" and then a wall of withdrawal records, so every prose test for
 * "is this section empty" gets it wrong in one direction or the other — and the
 * direction that reads a real finding as empty loses the finding. The agent is the
 * only one who knows, which is the same reason the prompt has it mark each
 * 拿不準的 entry.
 *
 * `null` means the line is missing, and that is NOT a green: a run whose format
 * drifted gets filed with the whole feedback, because "cannot tell" and "nothing
 * found" are the two things this harness exists to keep apart.
 */
export function parseVerdict(feedback) {
  const match = /field-verdict:\s*blocked=(\d+)\s+invented=(\d+)\s+withdrawn=(\d+)/i
    .exec(feedback ?? '');

  return match
    ? { blocked: Number(match[1]), invented: Number(match[2]), withdrawn: Number(match[3]) }
    : null;
}

/**
 * The two sections that are work — 卡到的 and 沒立場 — sliced out by their exact
 * headings, which the prompt mandates for this reason. 好用的, the withdrawal
 * records and 有立場 are the paper trail: they stay in the local report, where they
 * are still the main evidence that a run verified rather than guessed.
 *
 * A heading that drifted returns `null` and the caller pastes the whole file. A
 * splitter that quietly returned less than it was given would be the same defect
 * class as `impact`'s foreign rows: a number nobody can tell is short.
 */
export function problemSections(feedback) {
  const blocks = [];
  let open = null;

  for (const line of (feedback ?? '').split('\n')) {
    const heading = /^(#{2,4})\s+(.*?)\s*$/.exec(line);

    if (heading) {
      const wanted = /^卡到的/.test(heading[2]) || /^沒立場/.test(heading[2]);

      open = wanted ? { title: heading[2], body: [] } : null;

      if (open) blocks.push(open);
      continue;
    }

    if (open) open.body.push(line);
  }

  if (!blocks.length) return null;

  return blocks
    .map((block) => `#### ${block.title}\n${block.body.join('\n').trim()}`)
    .join('\n\n');
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
 * Decide what a run owes the inbox, and compose it. Pure: no gh, no filesystem, no
 * network — the reporting path is where three of this harness's four self-inflicted
 * bugs lived, and every one of them shipped because the only way to see this output
 * was to spend a real run on it.
 *
 * Two things it deliberately leaves out, because an issue is a list of things to fix
 * and the rest of a report is not that. **好用的, the withdrawal records and 有立場
 * stay in the local report**: they are the evidence that a run verified instead of
 * speculating — the number worth watching go up — and pasting them into the inbox
 * made every green run look like a work item. **A run that flagged nothing files no
 * issue at all**; that is the field test passing.
 *
 * What still forces a file, so "nothing to fix" can never cover for "nothing was
 * measured": a missing `field-verdict` line (format drift is not a green), a staging
 * failure, a non-zero agent exit, and a non-zero doctor exit. An `⊘ unverified`
 * doctor keeps exit 0 by design and does not force one — it rides along as a caveat
 * on the pass, because the check that could not run is usually the sandbox's missing
 * registry, and that has been judged twice.
 */
export function composeIssue({ reportFile, runs, skipped, tree, packedVersion }) {
  // Nothing to triage means nothing to file. A run where no scenario produced
  // feedback tested the machine, not the tree, and three such reports went into the
  // inbox as `agent exit 1 after 0.0m` rows that had to be deleted by hand. The
  // diagnosis is not lost with them: each agent's own error is on screen above and in
  // the local report. A run where SOME scenario produced feedback still files — the
  // report copies the failing agent's log tail, which is how an 81-byte "API Error"
  // survived a temp directory once.
  const evidence = runs.filter((run) => run.feedback);

  if (!evidence.length) return { kind: 'nothing-measured' };

  const matrix = runs.map((run) => `${run.scenario}×${run.agent}`).join(', ');

  // Green means every check passed, and doctor's exit code stopped saying that: a
  // check that could not run leaves exit 0 with an "Adoption unverified" banner, so
  // #132's new × codex was scored green while the one check proving the gates are
  // wired had never run. Read the verdict rather than the status — the same mistake
  // this harness exists to catch, made about the tool that made it.
  const verdict = (run) => (/Adoption unverified/.test(run.doctor?.output ?? '')
    ? 'unverified'
    : run.doctor?.code === 0 ? 'green' : 'red');

  // Counted over the scenarios that produced feedback, not over every staged one: a
  // row with no feedback contributes no evidence, and counting its doctor exit made
  // the title overstate what the run measured. Silent scenarios are named instead of
  // dropped, or the matrix and the denominator disagree with no explanation.
  const graded = evidence.map((run) => ({ run, counts: parseVerdict(run.feedback) }));
  const flagged = graded.filter((entry) => entry.counts
    && entry.counts.blocked + entry.counts.invented > 0);
  const unreadable = graded.filter((entry) => !entry.counts);
  const clean = graded.filter((entry) => entry.counts
    && entry.counts.blocked + entry.counts.invented === 0);
  const broke = runs.filter((run) => !run.dry
    && (run.staging || run.code !== 0 || run.doctor?.code !== 0));

  const adopted = evidence.filter((run) => verdict(run) === 'green').length;
  const unverified = evidence.filter((run) => verdict(run) === 'unverified').length;
  const silent = runs.filter((run) => !run.dry && !run.staging && !run.feedback).length;
  const withdrawn = graded.reduce((sum, entry) => sum + (entry.counts?.withdrawn ?? 0), 0);
  const findings = flagged.reduce(
    (sum, entry) => sum + entry.counts.blocked + entry.counts.invented,
    0,
  );

  if (!findings && !unreadable.length && !broke.length) {
    return { kind: 'pass', scenarios: evidence.length, withdrawn, unverified };
  }

  const scale = ` · doctor ${adopted}/${evidence.length} green`
    + (unverified ? ` · ${unverified} unverified` : '')
    + (silent ? ` · ${silent} produced nothing` : '')
    + (unreadable.length ? ` · ${unreadable.length} verdict unreadable` : '');
  const title = `Field run @ ${tree} — ${findings} finding(s) in ${evidence.length} scenario(s)${scale}`;

  const body = [
    '> **A release-validation journal, not a bug report.** The field harness',
    '> (`scripts/field-run.mjs`) runs a real agent CLI through blueprint\'s adoption',
    '> on staged repos, against the local unpublished tree. Owner-authored and',
    '> owner-closed by design.',
    '>',
    '> **This issue carries only what the run flagged** — each agent\'s 卡到的 and',
    '> 沒立場 sections. What an agent liked, the suspicions it checked and withdrew,',
    '> and the decisions it took from a stance the tool had already stated are the',
    '> run\'s paper trail and stay in the local report named below: evidence that a',
    '> run verified rather than guessed, not work items. **A run that flags nothing',
    '> files no issue at all** — that is the field test passing.',
    '>',
    '> A green doctor below means adoption mechanically completed — except where a',
    '> row says the staged repo arrived already adopted, and that row says what its',
    '> verdict covers. Whether a finding is fix-worthy is decided in the triage:',
    '> only a cost-channel 卡到的 gates the release, and the floor an entry has to',
    '> clear is in `.claude/docs/field-triage.md`.',
    '',
    `# Findings — blueprint field run @ ${tree}`,
    '',
    `tree: ${tree} (unreleased tree; tarball packed as v${packedVersion})`,
    `matrix: ${matrix}`,
    ...skipped.map((entry) => `skipped: ${entry.agent} — ${entry.reason}`),
    `local report (the full account, deliberately not pasted here): ${reportFile}`,
    '',
    ...flagged.flatMap(({ run, counts }) => [
      `## ${run.scenario} × ${run.agent} — ${counts.blocked} blocked, ${counts.invented} invented`,
      '',
      ...runFacts(run),
      '',
      problemSections(run.feedback)
        // Never less than it was given: a drifted heading means the whole file lands
        // here rather than a slice nobody can tell is short.
        ?? [
          '_(headings did not match the outline in `scripts/field-prompt.md`, so the whole',
          '  feedback file follows rather than the two sections)_',
          '',
          run.feedback,
        ].join('\n'),
      '',
    ]),
    ...unreadable.flatMap(({ run }) => [
      `## ${run.scenario} × ${run.agent} — verdict line missing`,
      '',
      ...runFacts(run),
      '',
      '_(no `field-verdict:` line, so the harness cannot tell what this run found —',
      '  filed whole, because "cannot tell" is not "found nothing")_',
      '',
      run.feedback,
      '',
    ]),
    ...broke.filter((run) => !run.feedback).flatMap((run) => [
      `## ${run.scenario} × ${run.agent} — ${run.staging ? 'staging failed, agent never ran' : 'no feedback'}`,
      '',
      run.staging
        ? `> ${run.staging}`
        : ['```', run.logTail ?? '(agent.log absent too)', '```'].join('\n'),
      '',
    ]),
    ...(clean.length
      ? [
          '## Clean scenarios',
          '',
          ...clean.map(({ run, counts }) =>
            `- ✓ ${run.scenario} × ${run.agent} — doctor ${verdict(run)}`
            + ` · 0 blocked, 0 invented, ${counts.withdrawn} withdrawn after checking`),
          '',
        ]
      : []),
  ].join('\n').slice(0, 60000);

  return { kind: 'file', title, body, findings };
}

/**
 * Act on that decision: print it, and file when there is something to file. Never
 * fails the run — without gh (or auth) the report simply stays local.
 */
function fileIssue(input) {
  const outcome = composeIssue(input);

  if (outcome.kind === 'nothing-measured') {
    console.log('⚠ no scenario produced feedback — nothing was measured, so no issue filed.');
    console.log('  This is NOT the field test passing: each agent\'s own error is in the report:');
    console.log(`  ${input.reportFile}`);

    return;
  }

  if (outcome.kind === 'pass') {
    console.log(
      `\n✓ field test PASSED — ${outcome.scenarios} scenario(s), 0 blocked, 0 invented stance(s),`
      + ` ${outcome.withdrawn} withdrawn after checking.`,
    );
    console.log('  No issue filed: the issue is the list of things to fix and there is nothing on it.');

    if (outcome.unverified) {
      console.log(
        `  Caveat: ${outcome.unverified} scenario(s) ended on a doctor that could not verify every`
        + ' check (⊘, exit 0 by design) — the report says which check and why.',
      );
    }

    console.log(`  Full account (好用的 / 查證後撤掉 / 有立場) stays local: ${input.reportFile}`);

    return;
  }

  if (!hasBinary('gh')) {
    console.log(`⚠ ${outcome.findings} finding(s), but no gh CLI — report stays local.`);
    console.log(`  ${input.reportFile}`);

    return;
  }

  const bodyFile = path.join(path.dirname(input.reportFile), 'issue-body.md');

  fs.writeFileSync(bodyFile, outcome.body);

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
      `gh issue create --title "${outcome.title}" --body-file "${bodyFile}" --label field-run`,
      { cwd: ROOT, encoding: 'utf-8' },
    ).trim();

    console.log(`✓ ${outcome.findings} finding(s) filed as the triage inbox: ${url}`);
    console.log(`  the full account of every scenario stays local: ${input.reportFile}`);
  } catch (error) {
    console.log(`⚠ could not file the issue (${error.message.split('\n')[0]}) — report stays local.`);
  }
}

// Run only when invoked, so `field-run.test.mjs` can import the reporting path
// without starting a build and a pack. That path is where three of this harness's
// four self-inflicted bugs lived — every one of them shipped because the only way to
// see its output was to spend a real run on it.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  });
}
