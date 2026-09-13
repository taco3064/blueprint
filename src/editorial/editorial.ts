import { resolveTestFiles } from '../config';
import type { ArchitectureDef, ResolvedTestFiles } from '../config';

export const TEST_FILES_SEMANTIC_NODE = 'architecture.testFiles';

export type EditorialLocale = 'en' | 'zh-TW';

export type TestFilesEdition
  = | 'agent-placement'
    | 'core'
    | 'deps'
    | 'gate-availability'
    | 'merge-scope'
    | 'reference'
    | 'survey';

export interface TestFilesReachFact {
  deadGlobs: string[];
  allGlobsDead: boolean;
  outsideScan: { glob: string; reason: string }[];
  undecidedGlobs: string[];
  divergentGlobs: string[];
}

export function renderTestFilesEditorial(
  edition: TestFilesEdition,
  locale: EditorialLocale,
  testFiles?: ArchitectureDef['testFiles'],
): string {
  return renderResolvedTestFilesEditorial(edition, locale, resolveTestFiles(testFiles));
}

export function renderResolvedTestFilesEditorial(
  edition: TestFilesEdition,
  locale: EditorialLocale,
  policy: ResolvedTestFiles,
): string {
  switch (edition) {
    case 'agent-placement': return renderAgentPlacement(policy, locale);
    case 'core': return renderCore(policy, locale);
    case 'deps': return renderDeps(policy, locale);
    case 'gate-availability': return renderGateAvailability(locale);
    case 'merge-scope': return renderMergeScope(policy, locale);
    case 'reference': return renderReference(policy, locale);
    case 'survey': return renderSurvey(policy, locale);
  }
}

function renderCore(policy: ResolvedTestFiles, locale: EditorialLocale): string {
  if (locale === 'zh-TW') {
    return policy.architectureExemptions.length
      ? `\`architecture.testFiles\` 只會讓 ${globs(policy)} 實際匹配到的檔案豁免於結構規則、度量關卡、inspect 分析與相依圖；測試專用規則仍會套用到相同 glob。掃描到、但沒有任何設定 glob 匹配的檔案，仍是一般原始碼。`
      : '`architecture.testFiles: []` 不會讓任何檔案豁免於結構規則、度量關卡、inspect 分析或相依圖，也讓測試專用規則沒有可套用的檔案。';
  }

  return policy.architectureExemptions.length
    ? `\`architecture.testFiles\` exempts only files matched by ${globs(policy)} from `
    + 'structural rules, metric gates, inspect analysis, and dependency graphs; test-only '
    + 'rules still target those same globs. A scanned file no configured glob matches '
    + 'remains ordinary source.'
    : '`architecture.testFiles: []` exempts nothing from structural rules, metric gates, '
      + 'inspect analysis, or dependency graphs, and leaves test-only rules with no files '
      + 'to target.';
}

function renderDeps(policy: ResolvedTestFiles, locale: EditorialLocale): string {
  if (locale === 'zh-TW') {
    return policy.architectureExemptions.length
      ? `**只有匹配 \`architecture.testFiles\` 的測試檔才會被排除。** ${globs(policy)} 匹配到的檔案，其匯入不會增加 unit 的影響範圍。掃描到、但沒有任何設定 glob 匹配的檔案仍是一般原始碼，因此其匯入會被計入。`
      : '**不會排除任何測試檔。** `architecture.testFiles: []` 讓每個掃描到的檔案都留在相依圖中，因此其匯入全部會被計入。';
  }

  return policy.architectureExemptions.length
    ? '**Test files are excluded only when they match `architecture.testFiles`.** '
    + `Imports from files matched by ${globs(policy)} add nothing to a unit's blast `
    + 'radius. A scanned file no configured glob matches remains ordinary source, so its '
    + 'imports count.'
    : '**No test files are excluded.** `architecture.testFiles: []` leaves every scanned '
      + 'file in the dependency graph, so all of their imports count.';
}

function renderGateAvailability(locale: EditorialLocale): string {
  return locale === 'zh-TW'
    ? '只有 `architecture.testFiles: []` 會讓 `testFilename` 無法啟用：'
    + '這條規則沒有可命名的檔案。宣告後沒有匹配任何掃描檔案的 glob 仍會成為關卡的檔案範圍，'
    + '而且可能在其他位置匹配到檔案。'
    : 'Only `architecture.testFiles: []` makes `testFilename` unavailable: the rule '
      + 'has no files to name. A declared glob that matches no scanned file still emits as the '
      + 'gate\'s file scope and may match elsewhere.';
}

function renderSurvey(policy: ResolvedTestFiles, locale: EditorialLocale): string {
  return locale === 'zh-TW'
    ? `survey 的匯入矩陣包含測試檔；inspect 只排除 ${globs(policy)} 實際匹配到的檔案，因此兩邊的數字只會差在這段已量測的範圍。`
    : 'The survey\'s import matrix includes test files; inspect excludes only '
      + `files matched by ${globs(policy)}, so the two counts differ by exactly that `
      + 'measured reach.';
}

function renderMergeScope(policy: ResolvedTestFiles, locale: EditorialLocale): string {
  if (locale === 'zh-TW') {
    return policy.architectureExemptions.length
      ? `每筆生成的結構 entry 都把 ${globs(policy)} 帶在各自的 \`ignores\`；重組 entry 時若漏掉這些 ignores，就會開始管到匹配的測試檔。`
      : '`architecture.testFiles: []` 不會提供任何測試檔 ignores 給生成的結構 entry，也就沒有項目需要帶進重組的 entry。';
  }

  return policy.architectureExemptions.length
    ? `Every generated structural entry carries ${globs(policy)} as per-entry \`ignores\`; `
    + 'a rebuilt entry without those ignores starts governing the matched test files.'
    : '`architecture.testFiles: []` gives generated structural entries no test-file '
      + 'ignores to carry into a rebuilt entry.';
}

function renderReference(policy: ResolvedTestFiles, locale: EditorialLocale): string {
  if (locale === 'zh-TW') {
    return `**\`architecture.testFiles\`** —— 匹配到的檔案會豁免於結構規則、`
      + '度量關卡、inspect 分析與相依圖，測試專用規則仍會套用；預設值為 '
      + `${globs(policy)}。空清單不豁免任何檔案，也讓 \`testFilename\` 沒有檔案範圍。`
      + '已宣告、但沒有匹配任何掃描檔案的 glob 在該處不產生豁免，關卡仍會 emit，'
      + '而且可能在其他位置匹配到檔案。';
  }

  return `**\`architecture.testFiles\`** — test globs whose matches are exempt from `
    + 'structural rules, metric gates, inspect analysis, and dependency graphs; test-only '
    + `rules still target them. The defaults are ${globs(policy)}. An empty list exempts `
    + 'nothing and leaves `testFilename` with no file scope. A declared glob that reaches no '
    + 'scanned file loses the exemption there, but the gate still emits and may match elsewhere.';
}

function renderAgentPlacement(policy: ResolvedTestFiles, locale: EditorialLocale): string {
  if (locale === 'zh-TW') {
    return policy.architectureExemptions.length
      ? `匹配 ${globs(policy)} 的測試支援檔位於上述所有放置規則之外；沒有任何 glob 匹配的檔案仍按一般原始碼放置。若放置規則擋到只為測試存在的檔案，請列出檔名並詢問 owner；不要自行放寬 \`architecture.testFiles\`，也不要只為匹配 glob 而改檔名。`
      : '`architecture.testFiles: []` 不會讓任何測試支援檔豁免於上述放置規則。';
  }

  return policy.architectureExemptions.length
    ? `Test support matching ${globs(policy)} sits outside every placement rule above; `
    + 'a file none of those globs matches is placed like ordinary source. If a placement '
    + 'rule stops files that exist only to serve tests, name them and ask the owner; never '
    + 'widen `architecture.testFiles` yourself or rename a file merely to match it.'
    : '`architecture.testFiles: []` exempts no test support from the placement rules above.';
}

export function renderEmptyTestFilesEditorial(locale: EditorialLocale): string {
  return {
    en: '`architecture.testFiles: []` exempts nothing, so there is no test file for '
      + 'this to name — declare test globs, or drop this gate',
    'zh-TW': '`architecture.testFiles: []` 不會豁免任何檔案，因此這裡沒有測試檔可命名；'
      + '請宣告測試 glob，或移除這個關卡',
  }[locale];
}

export function renderUnreachedTestFilesEditorial(
  locale: EditorialLocale,
  fact: TestFilesReachFact,
): string {
  return locale === 'en'
    ? renderUnreachedEnglish(fact)
    : renderUnreachedTraditionalChinese(fact);
}

function renderUnreachedEnglish(fact: TestFilesReachFact): string {
  const droppedHere = fact.allGlobsDead
    ? 'no scanned file is dropped from the analysis'
    : 'the scanned files dropped from the analysis are the ones the rest of the net matched';

  return '`architecture.testFiles` — no file here matches '
    + `${fact.deadGlobs.map((glob) => `\`${glob}\``).join(', ')}, so nothing this run read `
    + `is exempt through that part of the net: ${droppedHere}`
    + '. That is this scan\'s reach, not a verdict on the entry — `emit/lint` writes these '
    + 'globs into the `testFilename` entry\'s own `files` too, so where that gate is on it '
    + 'is emitted all the same and governs whatever they do match'
    + outsideScanEnglish(fact)
    + ownerDecisionEnglish(fact)
    + divergentEnglish(fact);
}

function outsideScanEnglish(fact: TestFilesReachFact): string {
  if (!fact.outsideScan.length) {
    return '';
  }

  const named = fact.outsideScan.map(({ glob, reason }) => `\`${glob}\` — ${reason}`);

  return `. Measured: ${named.join('; ')}. This scan reads the source root and nothing `
    + 'above it, never descends into the directories a build writes, and reads only source '
    + 'extensions, so an entry outside all three could not have matched here however the '
    + 'tree grew: what `emit/lint` emits for it is scoped rather than repo-wide — every '
    + '`ignores` it writes these globs into sits beside a `files`, so it subtracts only from '
    + 'the set that `files` names';
}

function ownerDecisionEnglish(fact: TestFilesReachFact): string {
  if (!fact.undecidedGlobs.length) {
    return '';
  }

  const split = fact.undecidedGlobs.length !== fact.deadGlobs.length;
  const names = fact.undecidedGlobs.map((glob) => `\`${glob}\``).join(', ');

  return '. A mistyped glob and a test convention whose files have not landed look '
    + `identical from here${split ? `, which leaves ${names} undecided` : ''} — fix the `
    + 'glob, or leave it and the exemption arms itself when a file matches; which one '
    + 'applies is the owner\'s call';
}

function divergentEnglish(fact: TestFilesReachFact): string {
  if (!fact.divergentGlobs.length) {
    return '';
  }

  return '. An entry beginning `!` is not read the same way on both sides — an ordinary '
    + 'path character to this scan, a negation to ESLint in a config glob — so blueprint '
    + 'cannot say what it holds out, and neither classifies it nor hands it back: '
    + fact.divergentGlobs.map((glob) => `\`${glob}\``).join(', ');
}

function renderUnreachedTraditionalChinese(fact: TestFilesReachFact): string {
  const droppedHere = fact.allGlobsDead
    ? '分析不會排除任何掃描到的檔案'
    : '分析排除的是其餘 glob 匹配到的掃描檔案';

  const outside = fact.outsideScan.length
    ? `；超出掃描範圍：${fact.outsideScan.map(({ glob, reason }) => `\`${glob}\` — ${reason}`).join('；')}`
    : '';

  const undecided = fact.undecidedGlobs.length
    ? `；${fact.undecidedGlobs.map((glob) => `\`${glob}\``).join('、')} 可能是拼錯的 glob，`
    + '也可能只是測試檔尚未加入，應由 owner 決定'
    : '';

  const divergent = fact.divergentGlobs.length
    ? `；以 \`!\` 開頭的 ${fact.divergentGlobs.map((glob) => `\`${glob}\``).join('、')} `
    + '在掃描器與 ESLint 中的解讀不同，因此 blueprint 不會替它分類'
    : '';

  return `\`architecture.testFiles\` —— 此處沒有檔案匹配 ${
    fact.deadGlobs.map((glob) => `\`${glob}\``).join('、')
  }，所以這次執行讀到的內容不會透過這部分取得豁免；${droppedHere}。`
  + '這只是本次掃描的可達範圍，不是對 entry 的判定；`emit/lint` 仍會把這些 '
  + 'glob 寫入 `testFilename` entry 的 `files`，關卡開啟時仍會治理它們在其他位置'
  + `匹配到的檔案${outside}${undecided}${divergent}。`;
}

function globs(policy: ResolvedTestFiles): string {
  return policy.architectureExemptions.map((glob) => `\`${glob}\``).join(' / ');
}
