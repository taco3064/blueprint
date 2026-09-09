import fs from 'node:fs';

function replaceExact(file, from, to) {
  const current = fs.readFileSync(file, 'utf8');
  if (!current.includes(from)) throw new Error(`missing snippet in ${file}`);
  fs.writeFileSync(file, current.replace(from, to));
}

replaceExact(
  'src/config/defineBlueprint.ts',
  '    validateOwns(layer);\n    validateLayerModule(layer);\n    validateLintOverrides(layer);',
  '    validateOwns(layer);\n    rejectRetiredLayerShape(layer);\n    validateLayerUnit(layer);\n    validateLintOverrides(layer);',
);

replaceExact(
  'src/config/defineBlueprint.ts',
  `function validateLayerFiles(layerFiles: string | string[] | undefined): void {\n  const globs = layerFiles === undefined ? [] : [layerFiles].flat();\n\n  for (const glob of globs) {\n    if (!LAYER_PLACEHOLDER.test(glob)) {\n      throw new Error(\`layerFiles entry "\${glob}" must include the "{layer}" placeholder.\`);\n    }\n  }\n}`,
  `function validateLayerFiles(\n  layerFiles: string | string[] | undefined,\n  moduleFirst: boolean,\n): void {\n  const globs = layerFiles === undefined ? [] : [layerFiles].flat();\n\n  for (const glob of globs) {\n    if (!LAYER_PLACEHOLDER.test(glob)) {\n      throw new Error(\`layerFiles entry "\${glob}" must include the "{layer}" placeholder.\`);\n    }\n\n    if (moduleFirst && !MODULE_PLACEHOLDER.test(glob)) {\n      throw new Error(\n        \`module-first layerFiles entry "\${glob}" must include both "{module}" and "{layer}" placeholders.\`,\n      );\n    }\n\n    if (!moduleFirst && MODULE_PLACEHOLDER.test(glob)) {\n      throw new Error(\n        \`layer-first layerFiles entry "\${glob}" must not include "{module}" — omit architecture.modules or remove that placeholder.\`,\n      );\n    }\n  }\n}`,
);
