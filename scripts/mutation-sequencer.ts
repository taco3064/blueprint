import { BaseSequencer } from 'vitest/node';
import type { TestSpecification } from 'vitest/node';

export function directTestOf(testFile: string, sourceFile: string) {
  const test = testFile.replaceAll('\\', '/');
  const source = sourceFile.replaceAll('\\', '/').replace(/\.[cm]?[jt]sx?$/, '');

  return test.startsWith(`${source}.`)
    && /^\.(?:[^/]+\.)?test\.[cm]?[jt]sx?$/.test(test.slice(source.length));
}

export default class MutationSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    const ordered = await super.sort(files);
    const sources = this.ctx.config.related ?? [];

    const direct = (file: TestSpecification) =>
      sources.some((source) => directTestOf(file.moduleId, source));

    return [...ordered.filter(direct), ...ordered.filter((file) => !direct(file))];
  }
}
