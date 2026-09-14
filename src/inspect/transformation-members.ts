import fs from 'node:fs';
import path from 'node:path';
import { transformationMemberIdentity } from '../plugin';
import type {
  GitReader, LayerToModuleObligation, TransformationDecision, TransformationObligationFailure,
} from '../project';

interface Context {
  root: string; repositoryRoot: string; obligation: LayerToModuleObligation; git: GitReader;
}

export function memberFailures(context: Context): TransformationObligationFailure[] {
  if (!contained(context.repositoryRoot, context.obligation.origin.applicationRoot)
    || !contained(context.root, context.obligation.origin.sourceRoot)) {
    return [];
  }

  const used = new Set<string>();

  return context.obligation.target.decisions.flatMap((decision) => {
    const source = context.obligation.origin.sources
      .find((entry) => entry.unit === decision.source);

    const expected = source?.members ?? [];

    return [
      ...mappingFailures(decision, expected),
      ...decision.members.flatMap((member) => proveMember(context, member, { expected, used })),
    ];
  });
}

function mappingFailures(
  decision: TransformationDecision, expected: string[],
): TransformationObligationFailure[] {
  const members = decision.members;

  return members.length !== expected.length
    || expected.some((member) => members.filter((entry) => entry.source === member).length !== 1)
    || decision.destinations.length !== members.length
    || members.some((member) => !decision.destinations.includes(member.destination))
    ? [{ code: 'member-mapping-incomplete', subject: decision.source }]
    : [];
}

function proveMember(
  context: Context, member: TransformationDecision['members'][number],
  proof: { expected: string[]; used: Set<string> },
): TransformationObligationFailure[] {
  const { expected, used } = proof;

  if (path.posix.extname(member.source) !== path.posix.extname(member.destination)
    || !expected.includes(member.source) || !contained(context.root, member.source)
    || !contained(context.root, member.destination)) {
    return [{
      code: 'member-identity-unproven', subject: member.source, expected: member.destination,
    }];
  }

  const target = path.resolve(context.root, member.destination);
  const identity = realIdentity(target);

  const failures: TransformationObligationFailure[] = used.has(identity)
    ? [{ code: 'member-destination-reused', subject: member.destination }]
    : [];

  used.add(identity);

  const repositoryMember = path.posix.join(
    context.obligation.origin.applicationRoot, member.source,
  );

  const original = context.git([
    'show', `${context.obligation.origin.head}:${repositoryMember}`,
  ], context.repositoryRoot);

  const destination = destinationIdentity(target, member.destination);

  const originalIdentity = original.status === 0
    ? transformationMemberIdentity(original.stdout, member.source)
    : null;

  if (preexistingDestination(context, member) || originalIdentity === null
    || originalIdentity !== destination) {
    failures.push({
      code: 'member-identity-unproven', subject: member.source,
      expected: member.destination,
    });
  }

  return failures;
}

function realIdentity(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return target;
  }
}

function destinationIdentity(target: string, destination: string): string | null {
  try {
    return transformationMemberIdentity(fs.readFileSync(target, 'utf8'), destination);
  } catch /* Stryker disable next-line BlockStatement: null/undefined both reject. */ {
    return null;
  }
}

function contained(root: string, value: string): boolean {
  if (!value || value.includes('\\') || /^[a-z]:/i.test(value) || path.isAbsolute(value)) {
    return false;
  }

  const realRoot = realIdentity(root);
  const relative = path.relative(realRoot, realIdentity(path.resolve(realRoot, value)));

  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function preexistingDestination(
  context: Context, member: TransformationDecision['members'][number],
): boolean {
  if (member.source === member.destination) {
    return false;
  }

  const destination = path.posix.join(
    context.obligation.origin.applicationRoot, member.destination,
  );

  const result = context.git([
    'ls-tree', '--name-only', context.obligation.origin.head, '--', destination,
  ], context.repositoryRoot);

  return result.status !== 0 || result.stdout.trim() !== '';
}
