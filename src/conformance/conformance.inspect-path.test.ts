import { expect, it } from 'vitest';
import { cli, makeRepo, rm } from './conformance';

it.each(['src', 'src/directives', '.', 'missing'])('rejects inspect path %s before scanning',
  async (target) => {
    const root = makeRepo({});

    try {
      const result = await cli(root, ['inspect', target, '--json']);

      expect(result.code).toBe(1);
      expect(result.output).toContain(`inspect does not accept a positional path: ${target}`);
      expect(result.output).not.toContain('Architecture Report');
    } finally {
      rm(root);
    }
  });
