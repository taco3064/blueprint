export {
  renderAuthoringAlternative,
  renderAuthoringHandoff,
  renderAuthoringRoute,
} from './authoring';
export type { AuthoringHandoffFact } from './authoring';
export {
  renderAcceptanceGates,
  renderResumePoint,
  renderRuleCatalog,
  renderSchemaSketch,
  renderSemantics,
  renderSurveyEvidence,
} from './authoring-catalog';
export { eslintConfigSource } from './authoring-eslint';
export { renderMethod } from './authoring-method';
export {
  renderModuleFirstGoal,
  renderModuleFirstMethod,
  renderModuleFirstNextNote,
  renderModuleFirstSchemaSketch,
  renderModuleFirstSemantics,
} from './authoring-module-first';
export { renderLintMerge } from './authoring-merge';
export {
  BROWNFIELD_MIN_FILES,
  cleanupTargets,
  printConfigCaveats,
  renderGoal,
  renderHeader,
  renderNextNote,
  renderPrerequisites,
} from './authoring-playbook';
export { renderVerdict } from './authoring-verdict';
export type {
  AuthoringClaudeDirFact,
  AuthoringRuleCatalogFact,
  AuthoringTopology,
  AuthoringVerdictFact,
  EslintConfigSourceFact,
  TscArtifactFact,
  ViteTsFact,
} from './authoring-types';

export { CLI_USAGE, renderCliCommandHelp } from './cli-help';
export {
  renderCliFailure,
  renderCliVersion,
  renderConflictingTopology,
  renderInvalidAgent,
  renderInvalidTopology,
  renderUnknownFlag,
} from './cli-errors';
export type { OperationalCommand } from './cli-help';
export type { OperationalText } from './operational-contract';
export {
  renderDependencyLeaderboard,
  renderDependencyTestExemption,
  renderDependencyUnit,
  renderUnknownDependencyTarget,
} from './deps';
export type { DependencyUnitFact } from './deps';
export { OPERATIONAL_SURFACES } from './registry';
export type {
  OperationalChannel,
  OperationalDelivery,
  OperationalSurface,
} from './registry';
export {
  renderEmptyTestFilesOperational,
  renderResolvedTestFilesOperational,
  renderTestFilesOperational,
  renderUnreachedTestFilesOperational,
  TEST_FILES_OPERATIONAL_NODE,
} from './test-files';
export type { OperationalLocale, TestFilesSurface, TestFilesReachFact } from './test-files';
export {
  renderBehavioral,
  renderChecklist,
  renderCompactContract,
  renderComponentShape as renderAgentComponentShape,
  renderContext,
  renderHardRules,
  renderHeader as renderAgentHeader,
  renderNaming as renderAgentNaming,
  renderPlacement,
  renderPlaybook as renderAgentPlaybook,
} from './agent';
export type { AgentGateFact, CompactContractFacts } from './agent';
export {
  renderArchitecture,
  renderComponentShape as renderHandbookComponentShape,
  renderHeader as renderHandbookHeader,
  renderImportDiscipline,
  renderNaming as renderHandbookNaming,
  renderPlaybook as renderHandbookPlaybook,
  renderPrinciples,
  renderRules,
  renderUnit,
} from './handbook';
export type { HandbookRuleFact } from './handbook';
export { renderPackagedAgentContract } from './agent-contract';
export { renderFieldPrompt, renderManualFieldPrompt } from './field-prompt';
export type { FieldTopology } from './field-prompt';
export {
  renderAgentContractNote,
  renderAliasAddedNote,
  renderAuthoringInstallSkipped,
  renderAuthoringLauncherNote,
  renderAuthoringPlaybookNote,
  renderBlueprintConfigNote,
  renderBundlerAliasInstruction,
  renderCodeStyleNote,
  renderDefaultAgentContractsNote,
  renderDependencyInstallNote,
  renderEslintConfigNote,
  renderEslintWiringNote,
  renderFirstAliasNote,
  renderGitignoreNote,
  renderHandbookWriteNote,
  renderInstallNote,
  renderInstallSkipped,
  renderInstallSkippedForPlan,
  renderIntegratedContractInstruction,
  renderJsconfigAliasNote,
  renderLayerDirectoryNote,
  renderLegacyCheckpointNote,
  renderLintScriptInstruction,
  renderLintScriptNote,
  renderOptionalToolingNote,
  renderReferenceContractInstruction,
  renderReferenceContractNote,
  renderScaffoldRemovalNote,
  renderStaleContractInstruction,
  renderStaleContractNote,
  renderTemplateCleanupNote,
  renderTsconfigAliasInstruction,
  renderViteAliasInstruction,
} from './bootstrap-actions';
export { layerToModuleBrief } from './transformation-layer-to-module';
export type { TransformationBriefFacts } from './transformation-layer-to-module';
export { moduleToLayerBrief } from './transformation-module-to-layer';
export type { ModuleToLayerBriefFacts } from './transformation-module-to-layer';
export {
  renderLayerToModuleRouterError,
  renderModuleToLayerAuthorityError,
  renderModuleToLayerRouterError,
  renderTransformationAction,
  renderTransformationInstallHandoff,
  renderTransformationInstallNote,
  renderTransformationNarration,
  renderTransformationPreflightError,
  renderTransformationReady,
  renderTransformationWriteNote,
} from './transformation';
export type {
  ArchitectureTopologyFact,
  FindingFact,
  LayerToModuleEvidenceFact,
  ModuleToLayerEvidenceFact,
  ProjectTransformationFact,
  TransformationActionFact,
  TransformationPreflightFact,
} from './transformation';
export {
  renderRepositoryAction,
  renderRepositoryLauncherConflictError,
  renderRepositoryNarration,
  renderRepositoryPlaybook,
  renderRepositoryPreflightError,
  renderRepositoryReady,
  renderRepositoryRouterError,
} from './transformation-repository';
export type { RepositoryPlaybookFacts } from './transformation-repository';
export { renderFindingMessage } from './findings';
export type { FindingMessageFact } from './findings';
export {
  renderDoctorCheck,
  renderDoctorReport,
  renderUncommittedDoctorNote,
  renderUnreachedIgnoreNote,
} from './doctor';
export type { DoctorCheckFact, DoctorCheckView } from './doctor';
export {
  renderArchitectureReport,
  renderBaselineGateOutput,
  renderBaselineError,
  renderBaselineSummary,
  renderBaselineUpdate,
  renderCoverageReport,
  renderCoverageSummary,
  renderInspectOutput,
  renderTestExemptionOutput,
  renderVacuousNextStep,
} from './inspect';
export type { BaselineErrorFact, CoverageView, FindingView } from './inspect';
export { renderSurveyReport, renderSurveyScopeNote } from './survey';
export type { SurveyReportFact } from './survey';
export {
  renderMetricGateNote,
  renderPackagesNotCompared,
  renderRulesReport,
  renderSelfOnlyMessageNote,
  STRUCTURAL_RULE_DESCRIPTIONS,
} from './rules';
export type {
  DocumentationRuleFact,
  RuleBanFact,
  RuleGateFact,
  StructuralRuleFact,
} from './rules';
export {
  renderImpactMissingConfig,
  renderImpactMissingDependency,
  renderImpactReport,
} from './impact';
export type { ImpactReportFact } from './impact';
export {
  renderCodeStylePluginError,
  renderDivergentReadingClause,
  renderEntryOnly,
  renderFixtureImport,
  renderLayerFlowViolation,
  renderLintGateNote,
  renderModuleContainerImport,
  renderModuleFlowViolation,
  renderOutOfScanReachClause,
  renderOwnersCallClause,
  renderRedundantRelativeSegments,
  renderRestrictedGlobal,
  renderRestrictedPackage,
  renderSameLayerImport,
  renderSelfOnlyReexport,
  renderTypeScriptOnlyUnavailable,
  renderVueOnlyUnavailable,
} from './lint';
export type { GlobReachFact, LintGateNoteId } from './lint';
export {
  renderActionLine,
  renderAgentCommand,
  renderAgentCommandOutput,
  renderAgentLaunchFailure,
  renderAgentLaunchHeader,
  renderAgentSessionNote,
  renderAuthoringAgentPrompt,
  renderAuthoringFlowBanner,
  renderContainmentRefusal,
  renderDirtyWorktreeReason,
  renderForkNote,
  renderFrameworkDetectionFailure,
  renderFreshScaffoldNote,
  renderGitProbeFallback,
  renderGitignoreArtifactComment,
  renderInitBanner,
  renderInitOptionError,
  renderInitStopped,
  renderInspectionFailure,
  renderInstallStarting,
  renderLegacyUpgradeMessage,
  renderMissingBlueprintExport,
  renderMixedRepositoryTopology,
  renderPreflightUnavailable,
  renderScopeCountReason,
  renderStaleContractCause,
  renderTopologyReason,
} from './runtime-messages';
export type {
  PreflightUnavailable,
  StaleContractCause,
  TopologyReason,
} from './runtime-messages';
