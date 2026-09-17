import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { emitAgentContract } from '../emit/agent';
import { emitHandbook } from '../emit/docs';
import {
  renderCliCommandHelp,
  renderFreshScaffoldNote,
  renderInitOptionError,
  renderTopologyReason,
} from '../operational-contract';
import { reactPreset, vuePreset } from '../presets';
import { cli, flattenProse, makeRepo, read, rm } from './conformance';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop() as string);
  }
});

function repositoryFile(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8');
}

async function authoringPlaybook(files: Record<string, string>, args: string[] = []) {
  const dir = makeRepo({ packageJson: { name: 'shop', dependencies: { react: '^18' } }, files });

  dirs.push(dir);
  await cli(dir, ['init', '--topology', 'module-first', ...args, '--no-install']);

  return read(dir, 'blueprint-authoring.md') ?? '';
}

async function surfaces(): Promise<Record<string, string>> {
  const runway = reactPreset({ name: 'shop', modules: [] });

  return {
    'cli help': renderCliCommandHelp({ brownfieldMinFiles: 10 }).init,
    'fresh scaffold note': renderFreshScaffoldNote({
      files: 0, threshold: 10, topology: 'module-first',
    }),
    'preset option error': renderInitOptionError('module-first-preset'),
    'preset topology reason': renderTopologyReason({ kind: 'module-first-preset' }),
    'repository preset reason': renderTopologyReason({ kind: 'repository-preset' }),
    'runway handbook': emitHandbook(runway),
    'runway compact contract': emitAgentContract(vuePreset({ modules: [] }), { compact: true }),
    'runway full contract': emitAgentContract(runway),
    'forced empty playbook': await authoringPlaybook({}, ['--authoring']),
    'brownfield playbook': await authoringPlaybook({
      'src/checkout/hooks/cart.ts': 'export const c = 1;\n',
    }),
    'packaged agent contract': repositoryFile('agent-contract.md'),
    readme: repositoryFile('README.md'),
    'docs commands': repositoryFile('docs/commands.md'),
    'docs configuration': repositoryFile('docs/configuration.md'),
    'docs generated files': repositoryFile('docs/generated-files.md'),
    'docs layers': repositoryFile('docs/philosophy/layers.md'),
    'zh-TW commands': repositoryFile('docs/zh-TW/commands.md'),
    'zh-TW configuration': repositoryFile('docs/zh-TW/configuration.md'),
    'zh-TW generated files': repositoryFile('docs/zh-TW/generated-files.md'),
    'zh-TW layers': repositoryFile('docs/zh-TW/philosophy/layers.md'),
  };
}

const flat = (text: string) => flattenProse(text.replace(/<br>/g, ' '));

describe('adoption claims agree across CLI, generated, packaged, and public surfaces', () => {
  it('never restates a retired greenfield or empty-module claim', async () => {
    const retired = [
      /module-first (?:implies|always requires) (?:authoring|an authored module map)/i,
      /modules must be a non-empty array/i,
      /no generic module-first preset and no starter early exit/i,
      /first module-first adoption/i,
      /Use the module-first authoring flow instead/i,
      /presets remain layer-first examples/i,
      /ordinary top-level folders below `sourceRoot` as module candidates/i,
      /never expand it yourself[^]*module growth protocol/i,
      /module growth protocol[^]*never expand it yourself/i,
      /所有首次 module-first 導入/,
      /module-first 一定要先由人或 Agent 決定模組圖/,
      /仍是 layer-first 範例/,
    ];

    const found = Object.entries(await surfaces()).flatMap(([surface, text]) =>
      retired.filter((claim) => claim.test(flat(text))).map((claim) => `${surface}: ${claim}`));

    expect(found).toEqual([]);
  });
});

describe('adoption claims state the runway and posture where they are described', () => {
  it('states empty module-first validity wherever the runway is described', async () => {
    const text = await surfaces();

    expect({
      cli: flat(text['cli help'])
        .includes('module-first scaffolds it as a runway with `modules: []`'),
      packaged: flat(text['packaged agent contract']).includes('declared — even as `[]`, a '
        + 'module-first runway with no domain module yet'),
      configuration: flat(text['docs configuration'])
        .includes('**`[]`** — a module-first runway'),
      zhConfiguration: flat(text['zh-TW configuration'])
        .includes('**`[]`** — module-first 起點'),
      handbook: flat(text['runway handbook']).includes('The absence is intended, not incomplete '
        + 'adoption.'),
    }).toEqual({
      cli: true, packaged: true, configuration: true, zhConfiguration: true, handbook: true,
    });
  });

  it('keeps greenfield canonical and brownfield conservative in public guidance', async () => {
    const text = await surfaces();
    const commands = flat(text['docs commands']);
    const zhCommands = flat(text['zh-TW commands']);

    expect({
      cliFloor: flat(text['cli help']).includes('a safe floor, not the recommended ceiling'),
      readmeFloor: flat(text.readme).includes('a floor you can tighten later, not the recommended '
        + 'ceiling'),
      commandsCanonical: commands.includes('scaffolds the framework preset\'s complete canonical '
        + 'governance'),
      commandsBrownfield: commands.includes('It does not switch on optional gates the repository '
        + 'never held.'),
      commandsFloor: commands.includes('a floor, not Blueprint\'s recommended ceiling'),
      zhCanonical: zhCommands.includes('建立框架預設設定的完整標準治理'),
      zhBrownfield: zhCommands.includes('它不會替專案打開原本沒有的選用檢查'),
      zhFloor: zhCommands.includes('是下限，不是 Blueprint 建議的上限'),
      brownfieldPlaybook: flat(text['brownfield playbook'])
        .includes('Brownfield adoption translates existing house thresholds only'),
    }).toEqual({
      cliFloor: true,
      readmeFloor: true,
      commandsCanonical: true,
      commandsBrownfield: true,
      commandsFloor: true,
      zhCanonical: true,
      zhBrownfield: true,
      zhFloor: true,
      brownfieldPlaybook: true,
    });
  });

  it.each([
    ['docs commands', 'text', [
      'Measure before changing anything',
      'Fix regressions. Only then record the understood pre-existing debt',
      'Never lower a target rule, threshold, or boundary merely to reach green.',
    ]],
    ['zh-TW commands', 'text', [
      '動手之前先量測',
      '先修好退步，再用 `npx blueprint inspect --update-baseline` 記錄已理解的既有債務',
      '絕不為了變綠而降低目標規則、門檻或邊界',
    ]],
  ] as const)('ships a measurement-first tightening prompt in %s', async (
    surface, fence, claims,
  ) => {
    const text = (await surfaces())[surface];
    const prompt = text.match(new RegExp(`\`\`\`${fence}\\n([^]*?)\`\`\``))?.[1] ?? '';

    expect(claims.filter((claim) => !flat(prompt).includes(claim))).toEqual([]);
    expect(flat(prompt).indexOf(claims[0])).toBeLessThan(flat(prompt).indexOf(claims[1]));
  });

  it('keeps the semantic layer-first projection out of topology authority', async () => {
    const text = await surfaces();

    expect({
      commands: flat(text['docs commands']).includes('It never describes the repository as '
        + 'layer-first, never writes a layer-first config, and never starts a topology '
        + 'transformation.'),
      zhCommands: flat(text['zh-TW commands']).includes('它不會把專案說成 layer-first、不會寫出 '
        + 'layer-first 設定檔，也不會啟動拓樸轉換'),
      handbook: flat(text['runway handbook']).includes('The projection is analysis, not topology'),
      fullContract: flat(text['runway full contract']).includes('The projection is analysis, not '
        + 'topology'),
      compact: flat(text['runway compact contract']).includes('a temporary layer-first projection '
        + 'for reasoning only'),
    }).toEqual({
      commands: true, zhCommands: true, handbook: true, fullContract: true, compact: true,
    });
  });
});
