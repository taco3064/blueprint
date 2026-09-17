import { operationalText } from './operational-contract';
import type { OperationalText } from './operational-contract';

export function renderInvalidTopology(): OperationalText {
  return operationalText('--topology expects one of: layer-first | module-first.');
}

export function renderConflictingTopology(): OperationalText {
  return operationalText('--topology was repeated with conflicting values.');
}

export function renderInvalidAgent(agentKinds: readonly string[]): OperationalText {
  return operationalText(`--agent expects one of: ${agentKinds.join(' | ')}.`);
}

export function renderUnknownFlag(command: string, flag: string): OperationalText {
  return operationalText(`unknown flag for ${command}: ${flag} — see: blueprint ${command} --help`);
}

export function renderMissingOperationId(): OperationalText {
  return operationalText('--complete expects the id of a pending upgrade operation, for example '
    + '`blueprint upgrade --complete review-retired-module-private`.');
}

export function renderCliFailure(message: string): OperationalText {
  return operationalText(`✗ ${message}`);
}

export function renderCliVersion(version: string): OperationalText {
  return operationalText(version);
}

export function renderUnexpectedInspectPath(value: string): OperationalText {
  return operationalText(`inspect does not accept a positional path: ${value}. `
    + 'Run blueprint inspect from the application root; it scans the configured sourceRoot.');
}
