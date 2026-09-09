export const BLUEPRINT_KEYS = [
  'name', 'framework', 'architecture', 'rules', 'principles',
  'componentShape', 'playbook', 'emit',
];

export const ARCHITECTURE_KEYS = [
  'alias', 'additionalAliases', 'sourceRoot', 'modules', 'layers',
  'layerFiles', 'layerFilesIgnore', 'testFiles', 'naming',
];

export const LAYER_KEYS = [
  'name', 'does', 'mustNot', 'owns', 'layout', 'entry',
  'allowedImporters', 'lintOverrides',
];
