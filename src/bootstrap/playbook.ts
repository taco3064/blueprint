import { COMMAND_FILE } from '../project';
import type { ClaudeDirState } from '../project';
import {
  BROWNFIELD_MIN_FILES,
  cleanupTargets as renderCleanupTargets,
  printConfigCaveats,
  renderGoal,
  renderHeader as renderOperationalHeader,
  renderNextNote,
  renderPrerequisites,
} from '../operational-contract';

export {
  BROWNFIELD_MIN_FILES,
  printConfigCaveats,
  renderGoal,
  renderNextNote,
  renderPrerequisites,
};

export function cleanupTargets(claudeDir: ClaudeDirState, claudeLauncher: boolean): string {
  return renderCleanupTargets({ ...claudeDir, commandFile: COMMAND_FILE }, claudeLauncher);
}

export function renderHeader(
  nextNote: string,
  verdict: string,
  facts: { claudeDir: ClaudeDirState; claudeLauncher: boolean },
): string {
  return renderOperationalHeader(nextNote, verdict, {
    claudeDir: { ...facts.claudeDir, commandFile: COMMAND_FILE },
    claudeLauncher: facts.claudeLauncher,
  });
}
