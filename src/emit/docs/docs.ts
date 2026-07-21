import type { Blueprint } from '../../config';
import {
  renderArchitecture,
  renderComponentShape,
  renderHeader,
  renderImportDiscipline,
  renderModule,
  renderNaming,
  renderPlaybook,
  renderPrinciples,
  renderRules,
} from './sections';

/** Where the generated handbook lives — the emit override, or the default. */
export function handbookPath(blueprint: Blueprint): string {
  return blueprint.emit?.handbook ?? 'docs/architecture-handbook.md';
}

/**
 * Compile a Blueprint into a human-readable Handbook (markdown). Pure and
 * deterministic — the same blueprint always yields the same string, so
 * Bootstrap can hash it to decide whether a rewrite is needed. Sections with
 * no data are omitted.
 * @group Emitters
 * @example
 * import { writeFileSync } from 'node:fs';
 *
 * writeFileSync('docs/architecture-handbook.md', emitHandbook(blueprint));
 */
export function emitHandbook(blueprint: Blueprint): string {
  const { name, architecture, principles, rules } = blueprint;
  // Trusts a validated blueprint (non-empty layers), same as emitLint.
  const exampleLayer = architecture.layers[0].name;

  const sections = [
    renderHeader(name),
    renderArchitecture(architecture),
    renderModule(architecture, exampleLayer),
    renderImportDiscipline(architecture),
    renderComponentShape(blueprint.componentShape),
    renderPrinciples(principles),
    renderPlaybook(blueprint.playbook),
    renderRules(rules),
    renderNaming(architecture.naming),
  ].filter(Boolean);

  return `${sections.join('\n\n')}\n`;
}
