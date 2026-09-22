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
  renderMissingOperationId,
  renderUnknownFlag,
  renderUnexpectedInspectPath,
} from './cli-errors';
export type { OperationalCommand } from './cli-help';
export type { OperationalText } from './operational-contract';
export {
  defineBlueprint,
  renderValidationError,
  renderValidationErrorCause,
  validateBlueprint,
  withValidationErrorRendering,
} from './validation-errors';
export type { ValidationErrorFact } from './validation-errors';
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
  renderLifecycle as renderAgentLifecycle,
  renderModuleGrowth as renderAgentModuleGrowth,
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
  renderModuleGrowth as renderHandbookModuleGrowth,
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
  renderGeneratedFormattingNote,
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
  renderNestedLintScriptInstruction,
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
  renderTransformationObligationWriteNote,
  renderTransformationObligationError,
  renderTransformationPreflightError,
  renderTransformationReady,
  renderTransformationRetireNote,
  renderTransformationRecoveryNote,
  renderTransformationWriteNote,
} from './transformation';
export type {
  ArchitectureTopologyFact,
  FindingFact,
  LayerToModuleEvidenceFact,
  ModuleToLayerEvidenceFact,
  ProjectTransformationFact,
  TransformationActionFact,
  TransformationObligationFailure,
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
  CURRENT_CONFIG_ADOPTION_SCOPE,
  renderArchitectureReport,
  renderBaselineGateOutput,
  renderBaselineError,
  renderBaselineSummary,
  renderBaselineUpdate,
  renderCoverageReport,
  renderCoverageSummary,
  renderInspectOutput,
  renderImportGraphDerivation,
  renderImportAnalysisUnavailable,
  renderTestExemptionOutput,
  renderVacuousNextStep,
} from './inspect';
export type { BaselineErrorFact, CoverageView, FindingView, ImportGraphFact } from './inspect';
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
  renderImpactUnavailable,
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
  renderDestructiveActionFailure,
  renderAgentCommand,
  renderAgentCommandOutput,
  renderAgentLaunchFailure,
  renderAgentLaunchHeader,
  renderAgentSessionNote,
  renderAuthoringAgentPrompt,
  renderAuthoringFlowBanner,
  renderContainmentRefusal,
  renderConfigReadFailure,
  renderDirtyWorktreeReason,
  renderForkNote,
  renderFrameworkDetectionFailure,
  renderEslintRuntimeFailure,
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
  renderModuleToLayerEvidenceTopologyError,
  renderPreflightUnavailable,
  renderScopeCountReason,
  renderStaleContractCause,
  renderTopologyReason,
} from './runtime-messages';
export type {
  LegacyManualRewriteFact,
  PreflightUnavailable,
  StaleContractCause,
  TopologyReason,
} from './runtime-messages';

export { renderTransformationRecoveryGuide } from './transformation-recovery';
export {
  renderLifecycleRecordNote,
  renderLifecycleRecordSkipped,
  renderLifecycleStateInvalid,
  renderLifecycleStateMissing,
} from './lifecycle';
export type { AdoptionGap, LifecycleEstablishment, LifecycleRecordSkip } from './lifecycle';
export {
  renderUpgradeComplete,
  renderUpgradeCurrent,
  renderUpgradeHandoff,
  renderUpgradeInstallStarting,
  renderUpgradeOperationCompleted,
  renderUpgradePlan,
  renderUpgradePlaybookWritten,
  renderUpgradeReconcile,
  renderUpgradeStateRecorded,
  renderUpgradeVerificationPending,
  renderUpgradeVerificationResult,
} from './upgrade';
export type {
  UpgradeInstallFact,
  UpgradePlanFact,
  UpgradeSourceEvidence,
  UpgradeVerificationFact,
} from './upgrade';
export {
  renderUpgradeInstruction,
  renderUpgradeVerification,
  UPGRADE_INSTRUCTION_IDS,
} from './upgrade-instructions';
export { renderUpgradePlaybook } from './upgrade-playbook';
export type { UpgradePlaybookFact, UpgradePlaybookOperationFact } from './upgrade-playbook';
export { renderUpgradeRefusal } from './upgrade-refusals';
export type { UpgradeRefusalFact } from './upgrade-refusals';
export {
  renderRemoveAction,
  renderRemoveComplete,
  renderRemoveEmptyDirectory,
  renderRemovePlan,
  renderRemovePhaseFailure,
  renderRemovePostconditionFailure,
  renderRemoveUninstall,
} from './remove';
export type {
  RemoveActionFact,
  RemovePlanFact,
  RemoveReasonFact,
  RemoveResidueFact,
} from './remove';
export { renderRemoveConflicts, renderRemoveRefusal } from './remove-conflicts';
export type { RemoveConflictFact, RemoveRefusalFact } from './remove-conflicts';
