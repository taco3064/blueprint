import type { Blueprint } from '../../config';
import type { StackFacts } from '../lint';
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

export function handbookPath(blueprint: Blueprint): string {
  return blueprint.emit?.handbook ?? 'docs/architecture-handbook.md';
}

/**
 * Compile a Blueprint into a human-readable Handbook (markdown). Pure and
 * deterministic — the same blueprint always yields the same string, so
 * Bootstrap can hash it to decide whether a rewrite is needed. Sections with
 * no data are omitted. `stack` carries the fact no Blueprint holds, which decides
 * whether the Rules table may name a machine for `explicitAny`.
 * @group Emitters
 * @example
 * import { writeFileSync } from 'node:fs';
 *
 * writeFileSync('docs/architecture-handbook.md', emitHandbook(blueprint));
 */
export function emitHandbook(blueprint: Blueprint, stack: StackFacts = {}): string {
  const { name, architecture, principles, rules } = blueprint;

  const exampleLayer = architecture.layers[0].name;

  const sections = [
    renderHeader(name),
    renderArchitecture(architecture),
    renderModule(architecture, exampleLayer),
    renderImportDiscipline(architecture),
    renderComponentShape(blueprint.componentShape),
    renderPrinciples(principles),
    renderPlaybook(blueprint.playbook),
    renderRules(rules, {
      framework: blueprint.framework,
      testFiles: architecture.testFiles,
      hasTypescript: stack.hasTypescript,
    }),
    renderNaming(architecture.naming),
  ].filter(Boolean);

  return `${sections.join('\n\n')}\n`;
}
