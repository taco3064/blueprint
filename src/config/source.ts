import type { ArchitectureDef } from './types';

export function sourceRoot(architecture: ArchitectureDef): string {
  return architecture.sourceRoot ?? 'src';
}

export function sourcePath(architecture: ArchitectureDef, ...parts: string[]): string {
  const root = sourceRoot(architecture);
  const tail = parts.filter(Boolean).join('/');

  return root === '.' ? tail : [root, tail].filter(Boolean).join('/');
}

export function sourceRootLabel(architecture: ArchitectureDef): string {
  const root = sourceRoot(architecture);

  return root === '.' ? 'the project root' : `${root}/`;
}

export function stripSourceRoot(input: string, architecture: ArchitectureDef): string[] {
  const segments = input.split(/[\\/]/).filter((part) => part !== '' && part !== '.');

  const root = sourceRoot(architecture)
    .split(/[\\/]/)
    .filter((part) => part !== '' && part !== '.');

  return root.every((part, index) => segments[index] === part)
    ? segments.slice(root.length)
    : segments;
}
