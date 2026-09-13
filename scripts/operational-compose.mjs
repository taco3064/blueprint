import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function composeOperationalArtifacts() {
  const {
    renderManualFieldPrompt,
    renderPackagedAgentContract,
  } = await import('../dist/operational-contract.js');

  return new Map([
    ['agent-contract.md', renderPackagedAgentContract()],
    ['scripts/field-prompt.md', renderManualFieldPrompt()],
  ]);
}

export function publishOperational(mode, files, root = ROOT) {
  const stale = [];

  for (const [relative, content] of files) {
    const target = path.join(root, relative);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;

    if (current === content) {
      continue;
    }

    if (mode === 'write') {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    } else {
      stale.push(relative);
    }
  }

  if (stale.length) {
    throw new Error(
      `Operational artifacts are stale:\n${stale.join('\n')}\n`
      + 'Run: npm run operational:compose',
    );
  }
}

async function main() {
  const mode = process.argv[2] === '--write' ? 'write' : 'check';
  const files = await composeOperationalArtifacts();

  publishOperational(mode, files);
  console.log(`${mode === 'write' ? 'Composed' : 'Verified'} operational artifacts.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  });
}
