from pathlib import Path


def update(path: str, pairs: list[tuple[str, str]]) -> None:
    p = Path(path)
    s = p.read_text()
    for old, new in pairs:
        if old in s:
            s = s.replace(old, new)
    p.write_text(s)


update('src/config/resolved.ts', [
    ('  aliasPathSpecifier,\n', ''),
    ("import { createPathMethods, resolveLayerFilePatterns } from './resolved-paths';",
     "import { createPathMethods } from './resolved-paths';\nexport { resolveLayerFilePatterns } from './resolved-paths';"),
])

update('src/config/resolved-paths.ts', [
    ("    resolveLayerRoot: (layer) => state.moduleFirst ? null : state.layerByName.get(layer)?.root ?? null,",
     "    resolveLayerRoot: (layer) => state.moduleFirst\n      ? null\n      : state.layerByName.get(layer)?.root ?? null,"),
    ("    moduleLayerFiles: (module, layer, framework) => moduleLayerFiles(state, { module, layer, framework }),",
     "    moduleLayerFiles: (module, layer, framework) =>\n      moduleLayerFiles(state, { module, layer, framework }),"),
    ("  if (!state.moduleFirst || !state.moduleByName.has(module) || !state.layerByName.has(layer)) { return null; }",
     "  if (!state.moduleFirst || !state.moduleByName.has(module) || !state.layerByName.has(layer)) {\n    return null;\n  }"),
    ("  if (root === null) { return []; }", "  if (root === null) {\n    return [];\n  }"),
    ("  if (aliasTarget !== undefined) { return aliasTarget === null ? null : classify(aliasTarget, input.router); }",
     "  if (aliasTarget !== undefined) {\n    return aliasTarget === null ? null : classify(aliasTarget, input.router);\n  }"),
    ("  if (!input.specifier.startsWith('.')) { return null; }",
     "  if (!input.specifier.startsWith('.')) {\n    return null;\n  }"),
    ("  if (!root) { return undefined; }", "  if (!root) {\n    return undefined;\n  }"),
    ("  if (!startsWith(parts, root.prefix)) { return null; }",
     "  if (!startsWith(parts, root.prefix)) {\n    return null;\n  }"),
    ("    if (part === '' || part === '.') { continue; }",
     "    if (part === '' || part === '.') {\n      continue;\n    }"),
    ("      if (result.pop() === undefined) { return null; }",
     "      if (result.pop() === undefined) {\n        return null;\n      }"),
    ("    } else { result.push(part); }", "    } else {\n      result.push(part);\n    }"),
])

update('src/emit/agent/sections.ts', [
    ('  sourcePath,\n', ''),
    ("    if (layer.mustNot?.length) { parts.push(` MUST NOT: ${layer.mustNot.join('; ')}.`); }",
     "    if (layer.mustNot?.length) {\n      parts.push(` MUST NOT: ${layer.mustNot.join('; ')}.`);\n    }"),
    ("    if (owns) { parts.push(` OWNS: ${owns}.`); }",
     "    if (owns) {\n      parts.push(` OWNS: ${owns}.`);\n    }"),
    ("  if (folderEntries.length) { bullets.push(`- Import folder units via their ${folderEntries.join(' / ')}, never their internals.`); }",
     "  if (folderEntries.length) {\n    bullets.push(\n      `- Import folder units via their ${folderEntries.join(' / ')}, never their internals.`,\n    );\n  }"),
    ("    if (held === 'lint') { bullets.push(`- ${gate} is a hard gate.`); }",
     "    if (held === 'lint') {\n      bullets.push(`- ${gate} is a hard gate.`);\n    }"),
    ("    if (held === 'inspect') { bullets.push(`- ${inspectDiagnosisClause(gate)}.`); }",
     "    if (held === 'inspect') {\n      bullets.push(`- ${inspectDiagnosisClause(gate)}.`);\n    }"),
    ("  if (architecture.naming && Object.keys(architecture.naming).length) { items.push('- [ ] Names follow the conventions above.'); }",
     "  if (architecture.naming && Object.keys(architecture.naming).length) {\n    items.push('- [ ] Names follow the conventions above.');\n  }"),
    ("  if (blueprint.componentShape?.length) { items.push('- [ ] Changed units hold against every component-shape axis, judged one by one.'); }",
     "  if (blueprint.componentShape?.length) {\n    items.push(\n      '- [ ] Changed units hold against every component-shape axis, judged one by one.',\n    );\n  }"),
    ("  if (claudePrinciples(principles).length) { items.push('- [ ] The behavioral principles above are upheld.'); }",
     "  if (claudePrinciples(principles).length) {\n    items.push('- [ ] The behavioral principles above are upheld.');\n  }"),
    ("        ...resolved.modules.map((module) => `  - \\`${module.root}/\\` — ${module.definition.does}.`),",
     "        ...resolved.modules.map(\n          (module) => `  - \\`${module.root}/\\` — ${module.definition.does}.`,\n        ),"),
    ("    ? [`- Test support is exempt from placement rules where these globs match: ${testGlobs.map((glob) => `\\`${glob}\\``).join(' / ')}.`]",
     "    ? [\n        '- Test support is exempt from placement rules where these globs match: '\n        + testGlobs.map((glob) => `\\`${glob}\\``).join(' / ')\n        + '.',\n      ]"),
    ("    '- Relative imports stay inside the current architectural scope; no redundant segments (`./../`, `././`).',",
     "    '- Relative imports stay inside the current architectural scope; no redundant segments '\n      + '(`./../`, `././`).',"),
])

update('src/emit/docs/sections.ts', [
    ("        'Modules are direct children of the source root. Each declared module reuses the same layer vocabulary below.',",
     "        'Modules are direct children of the source root. Each declared module reuses '\n          + 'the same layer vocabulary below.',"),
    ("    '- **No same-layer imports via the alias** — use a relative path inside the current architectural scope.',",
     "    '- **No same-layer imports via the alias** — use a relative path inside the current '\n      + 'architectural scope.',"),
    ("    bullets.push(`- **Entry-only** — import a folder unit through its ${folderEntries.join(' / ')}, never its internals.`);",
     "    bullets.push(\n      `- **Entry-only** — import a folder unit through its ${folderEntries.join(' / ')}, `\n      + 'never its internals.',\n    );"),
    ("    '- **Ownership** — packages and globals are restricted to their owning layer (see the *Owns* column above).',",
     "    '- **Ownership** — packages and globals are restricted to their owning layer '\n      + '(see the *Owns* column above).',"),
    ("    bullets.push('- **Module identity is declared** — source-root module folders come from `architecture.modules`; names such as `shared` and `app` have no special privilege.');",
     "    bullets.push(\n      '- **Module identity is declared** — source-root module folders come from '\n      + '`architecture.modules`; names such as `shared` and `app` have no special privilege.',\n    );"),
    ("    bullets.push('- **selfOnly** — a permitted importer may depend on the target layer but must never re-export it onward.');",
     "    bullets.push(\n      '- **selfOnly** — a permitted importer may depend on the target layer but must never '\n      + 're-export it onward.',\n    );"),
])
