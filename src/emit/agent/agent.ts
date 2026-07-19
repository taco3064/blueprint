import type { Blueprint } from '../../config';
import {
  renderBehavioral,
  renderChecklist,
  renderContext,
  renderHardRules,
  renderHeader,
  renderNaming,
  renderPlacement,
} from './sections';

/**
 * Compile a Blueprint into an agent operating contract (markdown). Where the
 * Handbook (S2) explains for humans, this is terse, imperative, and loaded
 * into an agent's context every turn. Pure and deterministic.
 *
 * Uses `##` headings (no `#`) so Bootstrap (S5) can inject it into an existing
 * CLAUDE.md, or write it standalone under its own title.
 */
export function emitAgentContract(blueprint: Blueprint): string {
  const { architecture, principles, rules } = blueprint;

  const sections = [
    renderHeader(),
    renderContext(blueprint),
    renderPlacement(architecture),
    renderNaming(architecture.naming),
    renderHardRules(architecture, rules),
    renderBehavioral(architecture, principles, rules),
    renderChecklist(blueprint),
  ].filter(Boolean);

  return `${sections.join('\n\n')}\n`;
}
