import { expect, it } from 'vitest';

import { renderFindingMessage } from './findings';

const lead = 'Module-first is closed-world at the source root: the folders under "src" are '
  + 'the whole module universe. Here ';

const boundary = ' — these dependencies cross the governed source '
  + 'boundary. The scan boundary is not the topology root, so narrowing '
  + '`architecture.sourceRoot` hides the dependency rather than removing it. ';

const forward = 'If the outside importers are intentional external consumers, '
  + 'declare their exact files in '
  + '`architecture.consumerFiles`. Otherwise widen or restructure `architecture.sourceRoot` '
  + 'and declare the application source correctly, or remove the dependency.';

const reverse = 'A consumer declaration never legalizes governed source '
  + 'depending on outside tooling. '
  + 'Remove that dependency, or move its target into the governed architecture and declare it '
  + 'correctly.';

it('offers consumer authoring only for intentional outside importers', () => {
  expect(renderFindingMessage({
    kind: 'uncovered-application-source', sourceRoot: 'src',
    imported: [], importing: ['scripts', 'tools'],
  })).toBe(lead + 'code under "src" is imported by "scripts", "tools"' + boundary + forward);
});

it('requires removal or governed inclusion for application dependencies on outside files', () => {
  expect(renderFindingMessage({
    kind: 'uncovered-application-source', sourceRoot: 'src', imported: ['tools'], importing: [],
  })).toBe(lead + 'code under "src" imports "tools"' + boundary + reverse);
});

it('keeps both facts and explains why the consumer declaration repairs only one direction', () => {
  expect(renderFindingMessage({
    kind: 'uncovered-application-source', sourceRoot: 'src',
    imported: ['tools'], importing: ['tools'],
  })).toBe(lead + 'code under "src" imports "tools", and code under "src" is imported by "tools"'
    + boundary + reverse
    + ' Declaring intentional outside importers in `architecture.consumerFiles` can remove only '
    + 'the consumer-to-application half; the reverse edge still blocks.');
});
