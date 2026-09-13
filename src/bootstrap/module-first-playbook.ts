import { COMMAND_FILE } from '../project';
import type { ClaudeDirState } from '../project';
import {
  renderModuleFirstGoal,
  renderModuleFirstMethod as renderOperationalMethod,
  renderModuleFirstNextNote,
  renderModuleFirstSchemaSketch,
  renderModuleFirstSemantics,
} from '../operational-contract';

export {
  renderModuleFirstGoal,
  renderModuleFirstNextNote,
  renderModuleFirstSchemaSketch,
  renderModuleFirstSemantics,
};

export function renderModuleFirstMethod(
  claudeDir: ClaudeDirState,
  claudeLauncher: boolean,
): string {
  return renderOperationalMethod({ ...claudeDir, commandFile: COMMAND_FILE }, claudeLauncher);
}
