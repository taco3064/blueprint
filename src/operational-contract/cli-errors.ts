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
