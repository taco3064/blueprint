import type { Rule } from 'eslint';
import { MUST_NOT_CAPABILITIES } from '../config';
import type { MustNotCapability, MustNotCapabilityDetector } from '../config';
import { child, globalReference, importedIdentity, nodeName, reactClass, terminalName }
  from './must-not-bindings';
import type { ProhibitionNode } from './must-not-bindings';
import { packageMatch } from './must-not-package';

export function capabilityMatch(
  context: Rule.RuleContext,
  node: ProhibitionNode,
  capability: MustNotCapability,
): boolean {
  const detector = MUST_NOT_CAPABILITIES[capability];

  return Boolean(
    (detector.jsx && ['JSXElement', 'JSXFragment'].includes(node.type))
    || (detector.vueTemplate && templateSignal(node))
    || platformSignal(context, node, detector)
    || boundCall(context, node, detector)
    || detector.packages?.some((name) => packageMatch(context, node, { package: name }))
    || (detector.reactClass && classSignal(context, node, detector.reactClass)),
  );
}

function platformSignal(
  context: Rule.RuleContext,
  node: ProhibitionNode,
  detector: MustNotCapabilityDetector,
): boolean {
  if (node.type === 'Identifier') {
    return Boolean(detector.globals?.includes(node.name!) && globalReference(context, node));
  }

  if (node.type !== 'MemberExpression') {
    return false;
  }

  const object = child(node, 'object');
  const name = terminalName(node);

  return Boolean(detector.globalMembers?.[object.name!]?.includes(name!)
    && globalReference(context, object));
}

function boundCall(
  context: Rule.RuleContext,
  node: ProhibitionNode,
  detector: MustNotCapabilityDetector,
): boolean {
  if (node.type !== 'CallExpression') {
    return false;
  }

  const identity = importedIdentity(context, child(node, 'callee'));

  return Boolean(identity && detector.packageCalls?.[identity.package]?.includes(identity.name));
}

function templateSignal(node: ProhibitionNode): boolean {
  if (node.type === 'VElement') {
    return node.name !== 'template';
  }

  return (node.type === 'VExpressionContainer' && node.expression !== null
    && node.parent?.type === 'VElement')
  || (node.type === 'VText' && typeof node.value === 'string' && node.value.trim().length > 0);
}

function classSignal(
  context: Rule.RuleContext,
  node: ProhibitionNode,
  names: string[],
): boolean {
  const signal = classMemberName(node);

  return names.includes(signal!) && reactClass(context, node);
}

function classMemberName(node: ProhibitionNode): string | null {
  if (['MethodDefinition', 'PropertyDefinition'].includes(node.type)) {
    const key = child(node, 'key');
    const name = declaredMemberName(node, key);

    return node.type === 'PropertyDefinition' && name !== 'state' ? null : name;
  }

  if (node.type !== 'MemberExpression' || child(node, 'object').type !== 'ThisExpression') {
    return null;
  }

  const name = terminalName(node);

  return name === 'setState'
    || (name === 'state' && node.parent?.type === 'AssignmentExpression'
      && node.parent.left === node)
    ? name
    : null;
}

function declaredMemberName(node: ProhibitionNode, key: ProhibitionNode): string | null {
  return node.computed && key.type !== 'Literal' ? null : nodeName(key);
}
