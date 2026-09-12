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

type Renderer = (policy: ResolvedTestFiles) => string;

const RENDERERS: Record<TestFilesEdition, Record<EditorialLocale, Renderer>> = {
  core: {
    en: (policy) => policy.architectureExemptions.length
      ? `\`architecture.testFiles\` exempts only files matched by ${globs(policy)} from `
      + 'structural rules, metric gates, inspect analysis, and dependency graphs; test-only '
      + 'rules still target those same globs. A scanned file no configured glob matches '
      + 'remains ordinary source.'
      : '`architecture.testFiles: []` exempts nothing from structural rules, metric gates, '
        + 'inspect analysis, or dependency graphs, and leaves test-only rules with no files '
        + 'to target.',
    'zh-TW': (policy) => policy.architectureExemptions.length
      ? `\`architecture.testFiles\` 只會讓 ${globs(policy)} 實際匹配到的檔案豁免於結構規則、度量關卡、inspect 分析與相依圖；測試專用規則仍會套用到相同 glob。掃描到、但沒有任何設定 glob 匹配的檔案，仍是一般原始碼。`
      : '`architecture.testFiles: []` 不會讓任何檔案豁免於結構規則、度量關卡、inspect 分析或相依圖，也讓測試專用規則沒有可套用的檔案。',
  },
  deps: {
    en: (policy) => policy.architectureExemptions.length
      ? '**Test files are excluded only when they match `architecture.testFiles`.** '
      + `Imports from files matched by ${globs(policy)} add nothing to a unit's blast `
      + 'radius. A scanned file no configured glob matches remains ordinary source, so its '
      + 'imports count.'
      : '**No test files are excluded.** `architecture.testFiles: []` leaves every scanned '
        + 'file in the dependency graph, so all of their imports count.',
    'zh-TW': (policy) => policy.architectureExemptions.length
      ? `**只有匹配 \`architecture.testFiles\` 的測試檔才會被排除。** ${globs(policy)} 匹配到的檔案，其匯入不會增加 unit 的影響範圍。掃描到、但沒有任何設定 glob 匹配的檔案仍是一般原始碼，因此其匯入會被計入。`
      : '**不會排除任何測試檔。** `architecture.testFiles: []` 讓每個掃描到的檔案都留在相依圖中，因此其匯入全部會被計入。',
  },
  'gate-availability': {
    en: () => 'Only `architecture.testFiles: []` makes `testFilename` unavailable: the rule '
      + 'has no files to name. A declared glob that matches no scanned file still emits as the '
      + 'gate\'s file scope and may match elsewhere.',
    'zh-TW': () => '只有 `architecture.testFiles: []` 會讓 `testFilename` 無法啟用：'
      + '這條規則沒有可命名的檔案。宣告後沒有匹配任何掃描檔案的 glob 仍會成為關卡的檔案範圍，'
      + '而且可能在其他位置匹配到檔案。',
  },
  survey: {
    en: (policy) => 'The survey\'s import matrix includes test files; inspect excludes only '
      + `files matched by ${globs(policy)}, so the two counts differ by exactly that `
      + 'measured reach.',
    'zh-TW': (policy) => `survey 的匯入矩陣包含測試檔；inspect 只排除 ${globs(policy)} 實際匹配到的檔案，因此兩邊的數字只會差在這段已量測的範圍。`,
  },
  'merge-scope': {
    en: (policy) => policy.architectureExemptions.length
      ? `Every generated structural entry carries ${globs(policy)} as per-entry \`ignores\`; `
      + 'a rebuilt entry without those ignores starts governing the matched test files.'
      : '`architecture.testFiles: []` gives generated structural entries no test-file '
        + 'ignores to carry into a rebuilt entry.',
    'zh-TW': (policy) => policy.architectureExemptions.length
      ? `每筆生成的結構 entry 都把 ${globs(policy)} 帶在各自的 \`ignores\`；重組 entry 時若漏掉這些 ignores，就會開始管到匹配的測試檔。`
      : '`architecture.testFiles: []` 不會提供任何測試檔 ignores 給生成的結構 entry，也就沒有項目需要帶進重組的 entry。',
  },
  reference: {
    en: (policy) => `**\`architecture.testFiles\`** — test globs whose matches are exempt from `
      + 'structural rules, metric gates, inspect analysis, and dependency graphs; test-only '
      + `rules still target them. The defaults are ${globs(policy)}. An empty list exempts `
      + 'nothing and leaves `testFilename` with no file scope. A declared glob that reaches no '
      + 'scanned file loses the exemption there, but the gate still emits and may match elsewhere.',
    'zh-TW': (policy) => `**\`architecture.testFiles\`** —— 匹配到的檔案會豁免於結構規則、`
      + '度量關卡、inspect 分析與相依圖，測試專用規則仍會套用；預設值為 '
      + `${globs(policy)}。空清單不豁免任何檔案，也讓 \`testFilename\` 沒有檔案範圍。`
      + '已宣告、但沒有匹配任何掃描檔案的 glob 在該處不產生豁免，關卡仍會 emit，'
      + '而且可能在其他位置匹配到檔案。',
  },
  'agent-placement': {
    en: (policy) => policy.architectureExemptions.length
      ? `Test support matching ${globs(policy)} sits outside every placement rule above; `
      + 'a file none of those globs matches is placed like ordinary source. If a placement '
      + 'rule stops files that exist only to serve tests, name them and ask the owner; never '
      + 'widen `architecture.testFiles` yourself or rename a file merely to match it.'
      : '`architecture.testFiles: []` exempts no test support from the placement rules above.',
    'zh-TW': (policy) => policy.architectureExemptions.length
      ? `匹配 ${globs(policy)} 的測試支援檔位於上述所有放置規則之外；沒有任何 glob 匹配的檔案仍按一般原始碼放置。若放置規則擋到只為測試存在的檔案，請列出檔名並詢問 owner；不要自行放寬 \`architecture.testFiles\`，也不要只為匹配 glob 而改檔名。`
      : '`architecture.testFiles: []` 不會讓任何測試支援檔豁免於上述放置規則。',
  },
};

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
  return RENDERERS[edition][locale](policy);
}

function globs(policy: ResolvedTestFiles): string {
  return policy.architectureExemptions.map((glob) => `\`${glob}\``).join(' / ');
}
