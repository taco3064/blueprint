import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const overlayFiles = [
  'docs/.vitepress/seo/index.ts',
  'docs/.vitepress/seo/seo.ts',
  'docs/.vitepress/theme/version-identity.ts',
  'docs/.vitepress/theme/VersionBadge.vue',
];

export const supportedConfigs = new Map([
  ['89608e9883060d6da8b1ec3ccc3768535b504e0b21e43f5b91a6e09db35d4b98', 'wrap'],
  ['e625feeeb09e6294e75b4965c2f8ca65be0fa8ae403627c6a4a4ea6013413630', 'native'],
]);

const digest = (content) => createHash('sha256').update(content).digest('hex');
const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const configPath = 'docs/.vitepress/config.mts';

export function planOverlay({ config, packageJson, lock, releaseTag, files }) {
  const inputConfigSha256 = digest(config.replaceAll('\r\n', '\n'));
  const mode = supportedConfigs.get(inputConfigSha256);
  if (!mode) throw new Error(`Unsupported released documentation config ${inputConfigSha256}; review compatibility before adding its fingerprint`);

  if (!/^v\d+\.\d+\.\d+$/.test(releaseTag) || `v${packageJson.version}` !== releaseTag) {
    throw new Error('Published stable release tag and package version must agree');
  }

  if (lock.packages?.['node_modules/vitepress']?.version !== '1.6.4') {
    throw new Error('Unsupported released VitePress version; review overlay compatibility');
  }

  for (const file of overlayFiles) {
    if (typeof files[file] !== 'string' || files[file].length === 0) throw new Error(`Missing overlay file: ${file}`);
  }

  return { inputConfigSha256, mode };
}

export function applyOverlay(tooling, site, releaseTag) {
  if (path.resolve(tooling) === path.resolve(site)) throw new Error('Overlay requires a separate released checkout');
  if (git(tooling, 'status', '--porcelain')) throw new Error('Publishing-tools checkout must be clean for reproducible provenance');
  const releaseSha = git(site, 'rev-parse', 'HEAD');
  const tagSha = git(site, 'rev-parse', `${releaseTag}^{commit}`);
  if (releaseSha !== tagSha) throw new Error('Released checkout HEAD must match the selected tag');
  if (git(site, 'status', '--porcelain')) throw new Error('Released checkout must be clean before applying the overlay');
  const toolingSha = git(tooling, 'rev-parse', 'HEAD');
  const config = read(site, configPath);
  const files = Object.fromEntries(overlayFiles.map((file) => [file, read(tooling, file)]));
  const plan = planOverlay({ config, packageJson: JSON.parse(read(site, 'package.json')), lock: JSON.parse(read(site, 'package-lock.json')), releaseTag, files });
  const preserved = git(site, 'ls-files').split('\n').filter((file) => file !== configPath && !overlayFiles.includes(file));

  const hashes = () => preserved.map((file) => [
    file, digest(fs.readFileSync(path.join(site, file))),
  ]);

  const before = hashes();

  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(site, file)), { recursive: true });
    fs.writeFileSync(path.join(site, file), content);
  }

  if (plan.mode === 'wrap') {
    fs.writeFileSync(path.join(site, 'docs/.vitepress/config.release.mts'), config);
    fs.writeFileSync(path.join(site, configPath), 'import released from \'./config.release.mts\';\nimport { withSeo } from \'./seo/index\';\nexport default withSeo(released);\n');
  }

  if (JSON.stringify(before) !== JSON.stringify(hashes())) throw new Error('Overlay changed released product content');

  const provenance = {
    schemaVersion: 1,
    overlayVersion: 1,
    releaseTag,
    releaseSha,
    toolingSha,
    inputConfigSha256: plan.inputConfigSha256,
    preservedFilesSha256: digest(JSON.stringify(before)),
    overlayFiles: Object.fromEntries(Object.entries(files).map(([file, content]) => [
      file, digest(content),
    ])),
  };

  fs.mkdirSync(path.join(site, 'docs/public'), { recursive: true });
  fs.writeFileSync(path.join(site, 'docs/public/docs-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);

  return provenance;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [tooling, site, releaseTag] = process.argv.slice(2);
  if (!tooling || !site || !releaseTag) throw new Error('Usage: node scripts/docs-overlay.mjs <tooling> <released-checkout> <release-tag>');
  const result = applyOverlay(path.resolve(tooling), path.resolve(site), releaseTag);

  console.log(JSON.stringify(result, null, 2));
}
