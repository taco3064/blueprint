import fs from 'node:fs';

function replaceAll(file, pairs) {
  let text = fs.readFileSync(file, 'utf8');
  for (const [from, to] of pairs) {
    if (!text.includes(from)) throw new Error(`missing snippet in ${file}: ${from.slice(0, 80)}`);
    text = text.split(from).join(to);
  }
  fs.writeFileSync(file, text);
}

replaceAll('src/emit/lint/lint.ts', [
  ["type ModuleLayout = 'folder' | 'flat';", "type UnitLayout = 'folder' | 'file';"],
  ['layer.module.layout', 'layer.unit.layout'],
  ['layer.module.entry', 'layer.unit.entry'],
  ['layouts: Record<string, ModuleLayout>;', 'layouts: Record<string, UnitLayout>;'],
]);

replaceAll('src/emit/lint/structural.ts', [
  ["moduleLayout: 'folder' | 'flat';", "moduleLayout: 'folder' | 'file';"],
  ["message: moduleLayout === 'flat'", "message: moduleLayout === 'file'"],
  ['Import a module through its entry, not its internals', 'Import a unit through its entry, not its internals'],
]);

replaceAll('src/plugin/relative-escape.ts', [
  ["additionalProperties: { enum: ['folder', 'flat'] }", "additionalProperties: { enum: ['folder', 'file'] }"],
  ["layouts?: Record<string, 'folder' | 'flat'>;", "layouts?: Record<string, 'folder' | 'file'>;"],
  ["const layoutOf = (layer: string): 'folder' | 'flat' => layouts[layer] ?? 'flat';", "const layoutOf = (layer: string): 'folder' | 'file' => layouts[layer] ?? 'file';"],
  ["what lives behind it is that module\\'s own business.", "what lives behind it is that unit\\'s own business."],
]);

replaceAll('src/plugin/relative.ts', [
  ["export type LayoutOf = (layer: string) => 'folder' | 'flat';", "export type LayoutOf = (layer: string) => 'folder' | 'file';"],
  ["layoutOf(segments[0]) === 'flat'", "layoutOf(segments[0]) === 'file'"],
]);

replaceAll('src/inspect/resolve.ts', [
  ['?.module.layout', '?.unit.layout'],
  ['resolved.folderShape.layout', "'file'"],
  ['resolved.folderShape.entry', "'index'"],
  ['layer.module.entry', 'layer.unit.entry'],
]);

replaceAll('src/inspect/wiring.ts', [
  ['entry.module.layout', 'entry.unit.layout'],
]);

replaceAll('src/inspect/analyze.ts', [
  ['?.module.layout', '?.unit.layout'],
  ['!.module.entry', '!.unit.entry'],
]);

replaceAll('src/presets/presets.ts', [
  ["name: 'pages',\n          does:", "name: 'pages',\n          layout: 'folder',\n          does:"],
  ["name: 'containers',\n          does:", "name: 'containers',\n          layout: 'folder',\n          does:"],
  ["name: 'components',\n          does:", "name: 'components',\n          layout: 'folder',\n          does:"],
  ["name: 'hooks',\n          does:", "name: 'hooks',\n          layout: 'folder',\n          does:"],
  ["name: 'contexts',\n          does:", "name: 'contexts',\n          layout: 'folder',\n          does:"],
  ["name: 'services',\n          does:", "name: 'services',\n          layout: 'folder',\n          does:"],
  ['implementation file is named after the module', 'implementation file is named after the unit'],
]);
