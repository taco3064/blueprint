import type { UpgradeCatalog, UpgradeOperation } from './types';
import { runningPackage } from './package';
import { compareVersions } from './version';

const BASE_CATALOG: UpgradeCatalog = {
  supportedFrom: '3.2.0',
  legacyConfigCheckpoint: '3.2.0',
  migrations: [
    {
      id: 'legacy-unit-shape',
      introducedIn: '4.0.0',
      supportsFrom: '3.2.0',
      applicability: { kind: 'legacy-config-shape' },
    },
  ],
  operations: [
    {
      id: 'review-retired-module-private',
      introducedIn: '4.0.0',
      requires: [],
      cancels: [],
      supersedes: [],
      applicability: { kind: 'legacy-config-key', key: 'module.private' },
      verification: { kind: 'no-files', pattern: 'blueprint.config.mjs.pre-v4-*' },
    },
  ],
  retired: [],
};

export const LEGACY_CONFIG_KEYS = ['module.private'] as const;

export const LIFECYCLE_SINCE = '4.1.0';

const PLANNED_OPERATIONS: readonly UpgradeOperation[] = [
  {
    id: 'review-module-root-unit',
    introducedIn: '4.2.0',
    requires: [],
    cancels: [],
    supersedes: [],
    applicability: { kind: 'source-below', version: '4.2.0' },
    verification: { kind: 'confirm' },
  },
];

export function upgradeCatalogFor(version: string): UpgradeCatalog {
  return {
    ...BASE_CATALOG,
    operations: [
      ...BASE_CATALOG.operations,
      ...PLANNED_OPERATIONS.filter((operation) =>
        compareVersions(operation.introducedIn, version) <= 0),
    ],
  };
}

export const UPGRADE_CATALOG = upgradeCatalogFor(runningPackage()?.version ?? '4.1.0');
