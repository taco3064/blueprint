import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOTS = ['src', 'scripts'];
const EXTENSIONS = new Set(['.ts', '.mjs']);

for (const root of ROOTS) {
  walk(root);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (EXTENSIONS.has(path.extname(entry.name))) migrateFile(full);
  }
}

function migrateFile(file) {
  const original = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, kind);
  const edits = [];

  visit(source, false);

  if (!edits.length) return;
  edits.sort((a, b) => b.start - a.start);
  let next = original;
  for (const edit of edits) {
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
  }
  fs.writeFileSync(file, next);

  function visit(node, covered) {
    if (ts.isObjectLiteralExpression(node) && !covered) {
      const architecture = architectureMigration(node);
      if (architecture) {
        edits.push({ start: node.getStart(source), end: node.end, text: print(architecture) });
        return;
      }

      const layer = layerMigration(node, undefined);
      if (layer.changed) {
        edits.push({ start: node.getStart(source), end: node.end, text: print(layer.node) });
        return;
      }
    }

    ts.forEachChild(node, (child) => visit(child, covered));
  }

  function architectureMigration(node) {
    const layersProp = property(node, 'layers');
    const moduleProp = property(node, 'module');
    const directFlat = property(node, 'layout');

    if (!layersProp || !moduleProp || !ts.isPropertyAssignment(moduleProp)
      || !ts.isObjectLiteralExpression(moduleProp.initializer)) {
      if (directFlat && ts.isPropertyAssignment(directFlat)
        && stringValue(directFlat.initializer) === 'flat') {
        return replaceProperty(node, directFlat,
          ts.factory.updatePropertyAssignment(directFlat, directFlat.name,
            ts.factory.createStringLiteral('file')));
      }
      return null;
    }

    const shared = shapeOf(moduleProp.initializer);
    const properties = node.properties.filter((candidate) => candidate !== moduleProp).map((candidate) => {
      if (candidate !== layersProp || !ts.isPropertyAssignment(candidate)
        || !ts.isArrayLiteralExpression(candidate.initializer)) return candidate;

      const elements = candidate.initializer.elements.map((element) => {
        if (!ts.isObjectLiteralExpression(element)) return element;
        return layerMigration(element, shared).node;
      });
      return ts.factory.updatePropertyAssignment(
        candidate,
        candidate.name,
        ts.factory.updateArrayLiteralExpression(candidate.initializer, elements),
      );
    });

    return ts.factory.updateObjectLiteralExpression(node, properties);
  }

  function layerMigration(node, shared) {
    const moduleProp = property(node, 'module');
    const layoutProp = property(node, 'layout');
    const looksLayer = property(node, 'name') && property(node, 'does');
    let changed = false;
    let properties = [...node.properties];
    let shape = shared;

    if (moduleProp && ts.isPropertyAssignment(moduleProp)
      && ts.isObjectLiteralExpression(moduleProp.initializer) && looksLayer) {
      shape = { ...shared, ...shapeOf(moduleProp.initializer) };
      properties = properties.filter((candidate) => candidate !== moduleProp);
      changed = true;
    }

    if (layoutProp && ts.isPropertyAssignment(layoutProp)
      && stringValue(layoutProp.initializer) === 'flat') {
      properties = properties.map((candidate) => candidate === layoutProp
        ? ts.factory.updatePropertyAssignment(layoutProp, layoutProp.name,
            ts.factory.createStringLiteral('file'))
        : candidate);
      changed = true;
    }

    if (looksLayer && shape) {
      properties = properties.filter((candidate) => !['layout', 'entry'].includes(nameOf(candidate)));
      const layout = shape.layout === 'folder' ? 'folder' : 'file';
      if (layout === 'folder') {
        properties.push(ts.factory.createPropertyAssignment('layout', ts.factory.createStringLiteral('folder')));
        if (shape.entry && shape.entry !== 'index') {
          properties.push(ts.factory.createPropertyAssignment('entry', ts.factory.createStringLiteral(shape.entry)));
        }
      }
      changed = true;
    }

    return { changed, node: changed ? ts.factory.updateObjectLiteralExpression(node, properties) : node };
  }

  function replaceProperty(node, oldProp, newProp) {
    return ts.factory.updateObjectLiteralExpression(
      node,
      node.properties.map((candidate) => candidate === oldProp ? newProp : candidate),
    );
  }

  function shapeOf(node) {
    const layout = property(node, 'layout');
    const entry = property(node, 'entry');
    return {
      layout: layout && ts.isPropertyAssignment(layout) ? stringValue(layout.initializer) : undefined,
      entry: entry && ts.isPropertyAssignment(entry) ? stringValue(entry.initializer) : undefined,
    };
  }

  function print(node) {
    return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printNode(
      ts.EmitHint.Expression,
      node,
      source,
    );
  }
}

function property(node, name) {
  return node.properties.find((candidate) => nameOf(candidate) === name);
}

function nameOf(node) {
  const name = node.name;
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function stringValue(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined;
}
