import { describe, expect, it } from 'vitest';

import { reactPreset, vuePreset } from '../../presets';
import { emitAgentContract } from './agent';

const flat = (text: string) => text.replace(/\s+/g, ' ');

const section = (text: string, heading: string) =>
  text.slice(text.indexOf(`${heading}\n`)).split(/\n(?=#{2,3} )/)[0];

const lineBefore = (text: string, prefix: string) => {
  const lines = text.split('\n');

  return lines[lines.findIndex((line) => line.startsWith(prefix)) - 1];
};

describe('emitAgentContract · module-first guidance', () => {
  const runway = vuePreset({ name: 'shop', modules: [] });
  const grown = vuePreset({ name: 'shop', modules: [{ name: 'checkout', does: 'Checkout.' }] });
  const layerFirst = vuePreset({ name: 'shop' });

  it('points the compact contract at the growth protocol instead of forbidding growth', () => {
    for (const blueprint of [runway, grown]) {
      const compact = flat(emitAgentContract(blueprint, { compact: true }));

      expect(compact).toContain('follow the module growth protocol in '
        + '[docs/architecture-handbook.md](docs/architecture-handbook.md)');

      expect(compact).toContain('- Module flow:');
      expect(compact).not.toContain('never expand it yourself');
    }

    const layer = flat(emitAgentContract(layerFirst, { compact: true }));

    expect(layer).toContain('never expand it yourself');
    expect(layer).not.toContain('module growth protocol');
    expect(layer).not.toContain('- Module flow:');
  });

  it('states the runway only while no domain module exists', () => {
    expect(emitAgentContract(runway, { compact: true })).toContain('- Module runway: ');
    expect(emitAgentContract(grown, { compact: true })).not.toContain('- Module runway: ');

    expect(lineBefore(emitAgentContract(runway, { compact: true }), '- Module flow:'))
      .toMatch(/^- Module runway: /);

    expect(lineBefore(emitAgentContract(grown, { compact: true }), '- Module flow:'))
      .toMatch(/^- Framework: /);

    expect(section(emitAgentContract(runway), '### Context')).toContain('- Module runway: ');
    expect(section(emitAgentContract(grown), '### Context')).not.toContain('- Module runway: ');
  });

  it('opens the full growth protocol from the runway only while no domain module exists', () => {
    const runwayGrowth = section(emitAgentContract(runway), '### Module growth protocol');
    const grownGrowth = section(emitAgentContract(grown), '### Module growth protocol');

    expect(runwayGrowth).toContain('declares no domain module yet — a module-first runway');
    expect(runwayGrowth).not.toContain('The declared modules are the current domain authority');
    expect(grownGrowth).toContain('The declared modules are the current domain authority');
  });

  it('keeps canonical layer placement in the full contract on an empty runway', () => {
    const full = flat(emitAgentContract(runway));

    expect(full).toContain('- `src/<module>/` — no domain module is declared yet.');
    expect(full).toContain('- `src/<module>/services/` — layer: Network primitives');
    expect(full).toContain('OWNS: `axios`, global `fetch`, global `WebSocket`.');
    expect(full).toContain('- `src/<module>/hooks/` — layer: Adapts server and shared state');
    expect(full).toContain('### Module growth protocol');
    expect(full).toContain('Grow modules only through the module growth protocol above');
  });

  it('roots runway placement at a project-root source', () => {
    const rooted = reactPreset({ modules: [] });

    rooted.architecture.sourceRoot = '.';

    expect(emitAgentContract(rooted)).toContain('- `<module>/components/` — layer:');
  });

  it('omits growth guidance from a layer-first full contract', () => {
    const full = emitAgentContract(layerFirst);

    expect(full).not.toContain('Module growth protocol');
    expect(full).not.toContain('module growth protocol');
    expect(full).not.toContain('<module>');
    expect(flat(full)).toContain('Outgrowing the config is the owner\'s call to make');
  });
});
