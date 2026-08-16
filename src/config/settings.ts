import type { RuleSetting, Tier } from './types';

/**
 * A rule setting read into one shape, whichever spelling the blueprint used.
 *
 * `opts` is the whole setting object, kept because a gate reads its own options
 * off it by name (`usePrefix`'s `layer` and `prefix`, for instance) and those are
 * open-ended by design.
 */
export interface ReadSetting {
  tier: Tier;
  value?: number;
  opts: Record<string, unknown>;
}

/**
 * Read a setting written either as a bare tier (`'error'`) or as an object
 * (`{ tier: 'error', value: 400 }`).
 *
 * One definition rather than a `typeof` at each use site, and the difference is
 * not only duplication. Written inline, the object arm usually reads the property
 * straight off the setting — `typeof s === 'string' ? undefined : s.value` — and a
 * string has no `.value`, so both arms answer undefined and the branch cannot be
 * wrong. Normalising to a shape FIRST puts the tier on the same branch, where
 * getting it wrong is immediately visible.
 */
export function readSetting(setting: RuleSetting): ReadSetting {
  const opts: { tier: Tier; value?: number } & Record<string, unknown>
    = typeof setting === 'string' ? { tier: setting } : setting;

  return { tier: opts.tier, value: opts.value, opts };
}

/**
 * The same read, but null for a setting that is absent or switched off — the
 * question every emitter and every runtime asks before it acts on a gate.
 */
export function activeSetting(setting: RuleSetting | undefined): ReadSetting | null {
  if (!setting) {
    return null;
  }

  const read = readSetting(setting);

  return read.tier === 'off' ? null : read;
}
