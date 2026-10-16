import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyOverlay, planOverlay } from './docs-overlay.mjs';

const copiedFiles = [
  'docs/.vitepress/seo/index.ts',
  'docs/.vitepress/seo/seo.ts',
  'docs/.vitepress/theme/version-identity.ts',
  'docs/.vitepress/theme/VersionBadge.vue',
];

const originalConfig = fs.readFileSync(new URL('./docs-overlay.fixture.txt', import.meta.url), 'utf8');

const inputs = () => ({
  config: originalConfig,
  packageJson: { version: '4.2.0' },
  lock: { packages: { 'node_modules/vitepress': { version: '1.6.4' } } },
  releaseTag: 'v4.2.0',
  files: Object.fromEntries(copiedFiles.map((file) => [file, `candidate:${file}`])),
});

const temporary = [];

afterEach(() => {
  temporary.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-overlay-'));

  temporary.push(root);
  const site = path.join(root, 'site');
  const tooling = path.join(root, 'tooling');

  const write = (dir, file, value) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), value);
  };

  const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const input = inputs();

  write(site, 'docs/.vitepress/config.mts', input.config);
  write(site, 'package.json', JSON.stringify(input.packageJson));
  write(site, 'package-lock.json', JSON.stringify(input.lock));
  write(site, 'docs/commands.md', 'released commands');
  write(site, 'src/index.ts', 'released API');
  write(tooling, 'docs/commands.md', 'unreleased command');
  write(tooling, 'src/index.ts', 'unreleased API');
  for (const file of copiedFiles) write(tooling, file, input.files[file]);

  for (const dir of [site, tooling]) {
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.name', 'Overlay Test');
    git(dir, 'config', 'user.email', 'overlay@example.test');
    git(dir, 'add', '.');
    git(dir, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture');
  }

  git(site, 'tag', 'v4.2.0');

  return { site, tooling, git, write };
}

describe('release-preserving documentation overlay', () => {
  it('accepts the reviewed release config with CRLF normalization', () => {
    expect(planOverlay(inputs())).toEqual({ inputConfigSha256: '89608e9883060d6da8b1ec3ccc3768535b504e0b21e43f5b91a6e09db35d4b98', mode: 'wrap' });
    expect(planOverlay({ ...inputs(), config: originalConfig.replaceAll('\n', '\r\n') })).toEqual(planOverlay(inputs()));
  });

  it('rejects an incompatible overlay before accepting configuration changes', () => {
    expect(() => planOverlay({ ...inputs(), config: originalConfig.replace('base: \'/blueprint/\'', 'base: \'/other/\'') })).toThrow('Unsupported released documentation config');
  });

  it('accepts the reviewed native config without wrapping it again', () => {
    const config = fs.readFileSync(new URL('../docs/.vitepress/config.mts', import.meta.url), 'utf8');

    expect(planOverlay({ ...inputs(), config }).mode).toBe('native');
    const { site, tooling, git, write } = fixture();

    write(site, 'docs/.vitepress/config.mts', config);
    git(site, 'add', '.');
    git(site, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'native');
    git(site, 'tag', '-f', 'v4.2.0');
    applyOverlay(tooling, site, 'v4.2.0');
    expect(fs.readFileSync(path.join(site, 'docs/.vitepress/config.mts'), 'utf8')).toBe(config);
    expect(fs.existsSync(path.join(site, 'docs/.vitepress/config.release.mts'))).toBe(false);
  });

  it.each(['v4.2.1', 'v4.2.0-beta.1', '', '4.2.0'])('rejects invalid or mismatched tag %s', (releaseTag) => {
    expect(() => planOverlay({ ...inputs(), releaseTag })).toThrow('stable release tag');
  });

  it.each([undefined, {}, { packages: {} }, { packages: { 'node_modules/vitepress': { version: '2.0.0' } } }])('rejects unsupported dependency compatibility %#', (lock) => {
    expect(() => planOverlay({ ...inputs(), lock: lock ?? {} })).toThrow('Unsupported released VitePress');
  });

  it.each(copiedFiles)('requires allowlisted presentation file %s', (file) => {
    const input = inputs();

    delete input.files[file];
    expect(() => planOverlay(input)).toThrow(`Missing overlay file: ${file}`);
    input.files[file] = '';
    expect(() => planOverlay(input)).toThrow(`Missing overlay file: ${file}`);
  });

  it('copies only the explicit presentation allowlist and records exact provenance', () => {
    const { site, tooling, git } = fixture();
    const provenance = applyOverlay(tooling, site, 'v4.2.0');

    expect(provenance.releaseSha).toBe(git(site, 'rev-parse', 'HEAD'));
    expect(provenance.toolingSha).toBe(git(tooling, 'rev-parse', 'HEAD'));
    expect(provenance.releaseTag).toBe('v4.2.0');
    expect(Object.keys(provenance.overlayFiles)).toEqual(copiedFiles);
    for (const file of copiedFiles) expect(fs.readFileSync(path.join(site, file), 'utf8')).toBe(`candidate:${file}`);
    expect(fs.readFileSync(path.join(site, 'docs/commands.md'), 'utf8')).toBe('released commands');
    expect(fs.readFileSync(path.join(site, 'src/index.ts'), 'utf8')).toBe('released API');
    expect(JSON.parse(fs.readFileSync(path.join(site, 'package.json'), 'utf8'))).toEqual({ version: '4.2.0' });
    expect(fs.readFileSync(path.join(site, 'docs/.vitepress/config.release.mts'), 'utf8')).toBe(originalConfig);
    expect(fs.readFileSync(path.join(site, 'docs/.vitepress/config.mts'), 'utf8')).toContain('export default withSeo(released);');
    expect(JSON.parse(fs.readFileSync(path.join(site, 'docs/public/docs-provenance.json'), 'utf8'))).toEqual(provenance);
  });

  it('rejects dirty released checkout without writing an overlay', () => {
    const { site, tooling, write } = fixture();

    write(site, 'docs/commands.md', 'dirty');
    expect(() => applyOverlay(tooling, site, 'v4.2.0')).toThrow('must be clean');
    expect(fs.existsSync(path.join(site, copiedFiles[0]))).toBe(false);
  });

  it('rejects a checkout at a different commit from the release', () => {
    const { site, tooling, git, write } = fixture();

    write(site, 'new.txt', 'new');
    git(site, 'add', '.');
    git(site, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'unreleased');
    expect(() => applyOverlay(tooling, site, 'v4.2.0')).toThrow('HEAD must match');
    expect(fs.existsSync(path.join(site, copiedFiles[0]))).toBe(false);
  });

  it('rejects applying over the tooling checkout', () => {
    expect(() => applyOverlay('.', '.', 'v4.2.0')).toThrow('separate released checkout');
  });

  it('rejects dirty tooling instead of publishing misleading commit provenance', () => {
    const { site, tooling, write } = fixture();

    write(tooling, copiedFiles[0], 'dirty');
    expect(() => applyOverlay(tooling, site, 'v4.2.0')).toThrow('Publishing-tools checkout must be clean');
    expect(fs.existsSync(path.join(site, copiedFiles[0]))).toBe(false);
  });
});
