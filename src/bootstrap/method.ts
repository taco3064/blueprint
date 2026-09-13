import { COMMAND_FILE } from '../project';
import type { ClaudeDirState } from '../project';
import { renderMethod as renderOperationalMethod } from '../operational-contract';

export function renderMethod(claudeDir: ClaudeDirState, claudeLauncher: boolean): string {
  return renderOperationalMethod({ ...claudeDir, commandFile: COMMAND_FILE }, claudeLauncher);
}
