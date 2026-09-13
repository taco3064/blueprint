import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { OPERATIONAL_SURFACES } from './registry';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../..');

const supportFiles = new Set([
  'authoring-types.ts',
  'index.ts',
  'operational-contract.ts',
  'registry.ts',
]);

function productionFiles(directoryPath: string): string[] {
  return fs.readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      return productionFiles(absolute);
    }

    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      ? [absolute]
      : [];
  });
}

describe('operational surface registry', () => {
  it('registers every production renderer owner exactly once', () => {
    const productionOwners = fs.readdirSync(directory)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => !file.endsWith('.test.ts') && !supportFiles.has(file))
      .sort();

    const registeredOwners = OPERATIONAL_SURFACES.map(({ owner }) => owner).sort();

    expect(registeredOwners).toEqual(productionOwners);

    expect(new Set(OPERATIONAL_SURFACES.map(({ id }) => id)).size)
      .toBe(OPERATIONAL_SURFACES.length);
  });

  it('points only at existing consumers and declares verification', () => {
    for (const surface of OPERATIONAL_SURFACES) {
      expect(surface.consumers.length, surface.id).toBeGreaterThan(0);
      expect(surface.targets.length, surface.id).toBeGreaterThan(0);
      expect(surface.verification.length, surface.id).toBeGreaterThan(0);

      for (const consumer of surface.consumers) {
        expect(fs.existsSync(path.join(repository, consumer)), `${surface.id}: ${consumer}`).toBe(true);
      }
    }
  });

  it('matches every production consumer of the governed boundary', () => {
    const actualConsumers = productionFiles(path.join(repository, 'src'))
      .filter((file) => !file.startsWith(directory))
      .filter((file) => /from ['"](?:\.\.\/)+operational-contract(?:\/|['"])/
        .test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(repository, file))
      .sort();

    const registeredConsumers = [...new Set(
      OPERATIONAL_SURFACES.flatMap(({ consumers }) => consumers)
        .filter((file) => file.startsWith('src/')),
    )].sort();

    expect(registeredConsumers).toEqual(actualConsumers);
  });

  it('keeps the contract below high-level policy modules', () => {
    for (const surface of OPERATIONAL_SURFACES) {
      const source = fs.readFileSync(path.join(directory, surface.owner), 'utf8');

      expect(source, surface.id).not.toMatch(/from ['"]\.\.\/(?:bootstrap|inspect|project)(?:\/|['"])/);
    }
  });

  it('keeps authored paragraphs out of registered production consumers', () => {
    const violations: string[] = [];

    const consumers = [...new Set(OPERATIONAL_SURFACES.flatMap(({ consumers }) => consumers))]
      .filter((file) => file.startsWith('src/'));

    for (const consumer of consumers) {
      const source = ts.createSourceFile(
        consumer,
        fs.readFileSync(path.join(repository, consumer), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );

      const visit = (node: ts.Node): void => {
        if (
          (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
          && node.text.length >= 80
          && /[.!?—]/.test(node.text)
        ) {
          const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;

          violations.push(`${consumer}:${line}`);
        }

        ts.forEachChild(node, visit);
      };

      ts.forEachChild(source, visit);
    }

    expect(violations).toEqual([]);
  });
});
