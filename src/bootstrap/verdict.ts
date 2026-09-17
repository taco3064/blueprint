import { COMMAND_FILE } from '../project';
import type {
  ClaudeDirState,
  PackageManager,
  TscArtifactLocation,
  ViteTsCoverage,
} from '../project';
import type { SurveyResult } from '../survey';
import { renderVerdict as renderOperationalVerdict } from '../operational-contract';
import { scriptCommand } from './plan';
import type { ArchitectureTopology } from './topology';

export function renderVerdict(
  survey: SurveyResult,
  facts: {
    claudeDir: ClaudeDirState;
    viteTs: ViteTsCoverage | null;
    tscOut: TscArtifactLocation | null;
    pm: PackageManager;
    topology: ArchitectureTopology;
    claudeLauncher: boolean;
    next: boolean;
  },
): string {
  return renderOperationalVerdict({
    scopeRequired: survey.scopeRequired ?? false,
    totalFiles: survey.totalFiles,
  }, {
    claudeDir: { ...facts.claudeDir, commandFile: COMMAND_FILE },
    viteTs: facts.viteTs,
    tscOut: facts.tscOut,
    commands: {
      build: scriptCommand(facts.pm, 'build'),
      lint: scriptCommand(facts.pm, 'lint'),
    },
    topology: facts.topology,
    claudeLauncher: facts.claudeLauncher,
    next: facts.next,
  });
}
