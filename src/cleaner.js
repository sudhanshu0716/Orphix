import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';

const traverse = traverseModule.default || traverseModule;
const generate = generateModule.default || generateModule;

/**
 * Automatically clean up unused code and files based on analysis results.
 * @param {object} results - Orphix analysis results
 * @param {string} [targetDir] - scanning target directory for path containment check
 */
export function cleanProject(results, targetDir = '.') {
  const resolvedTarget = path.resolve(targetDir);

  // Helper to ensure files are strictly contained within target directory (prevents path traversal/symlink escape)
  const isSafePath = (filePath) => {
    const resolvedFile = path.resolve(filePath);
    const relative = path.relative(resolvedTarget, resolvedFile);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  };

  // 1. Delete unused files
  for (const f of results.unusedFiles) {
    if (!isSafePath(f.file)) {
      console.warn(`Warning: Security block. Prevented deletion of file outside target directory: ${f.file}`);
      continue;
    }
    if (fs.existsSync(f.file)) {
      fs.unlinkSync(f.file);
      console.log(`Deleted unused file: ${f.relativeFile}`);
    }
  }

  // 2. Group code modifications by file to parse each file only once
  const cleanups = {};

  const getEntry = (file) => {
    if (!cleanups[file]) {
      cleanups[file] = { unusedImports: [], unusedExports: [], unusedFunctions: [] };
    }
    return cleanups[file];
  };

  for (const imp of results.unusedImports || []) {
    getEntry(imp.file).unusedImports.push(imp.name);
  }
  for (const exp of results.unusedExports || []) {
    getEntry(exp.file).unusedExports.push(exp.name);
  }
  for (const fn of results.unusedFunctions || []) {
    getEntry(fn.file).unusedFunctions.push(fn.name);
  }

  // Apply AST modifications
  for (const [file, actions] of Object.entries(cleanups)) {
    if (!isSafePath(file)) {
      console.warn(`Warning: Security block. Prevented rewriting of file outside target directory: ${file}`);
      continue;
    }
    if (!fs.existsSync(file)) continue;

    try {
      const code = fs.readFileSync(file, 'utf-8');
      const ast = parse(code, {
        sourceType: 'module',
        plugins: [
          'jsx',
          'typescript',
          ['decorators', { decoratorsBeforeExport: true }],
          'classProperties',
          'classPrivateProperties',
          'classPrivateMethods',
          'exportDefaultFrom',
          'exportNamespaceFrom',
          'dynamicImport',
        ],
      });

      traverse(ast, {
        ImportDeclaration(pathNode) {
          if (actions.unusedImports.length === 0) return;

          // Filter out unused specifiers
          pathNode.node.specifiers = pathNode.node.specifiers.filter(spec => {
            const name = spec.local.name;
            return !actions.unusedImports.includes(name);
          });

          // Remove the statement if it has no specifiers left
          if (pathNode.node.specifiers.length === 0) {
            pathNode.remove();
          }
        },

        ExportNamedDeclaration(pathNode) {
          if (pathNode.node.declaration) {
            const decl = pathNode.node.declaration;
            let names = [];

            if (decl.type === 'VariableDeclaration') {
              names = decl.declarations.map(d => d.id.name).filter(Boolean);
            } else if (decl.id && decl.id.name) {
              names = [decl.id.name];
            }

            const allUnused = names.every(name => actions.unusedExports.includes(name));
            if (allUnused && names.length > 0) {
              const fullyDead = names.every(name => actions.unusedFunctions.includes(name));
              if (fullyDead) {
                // If not used locally, remove declaration completely
                pathNode.remove();
              } else {
                // If used locally, just strip the "export" keyword
                pathNode.replaceWith(decl);
              }
            }
          } else if (pathNode.node.specifiers) {
            pathNode.node.specifiers = pathNode.node.specifiers.filter(spec => {
              const name = spec.exported.name || spec.exported.value;
              return !actions.unusedExports.includes(name);
            });

            if (pathNode.node.specifiers.length === 0) {
              pathNode.remove();
            }
          }
        },

        FunctionDeclaration(pathNode) {
          if (pathNode.node.id && pathNode.node.id.name) {
            const name = pathNode.node.id.name;
            if (actions.unusedFunctions.includes(name) && pathNode.parent.type !== 'ExportNamedDeclaration') {
              pathNode.remove();
            }
          }
        },

        VariableDeclarator(pathNode) {
          if (pathNode.node.id && pathNode.node.id.name) {
            const name = pathNode.node.id.name;
            if (actions.unusedFunctions.includes(name) && pathNode.parentPath.parent.type !== 'ExportNamedDeclaration') {
              if (pathNode.parent.declarations.length === 1) {
                pathNode.parentPath.remove();
              } else {
                pathNode.remove();
              }
            }
          }
        },

        ClassDeclaration(pathNode) {
          if (pathNode.node.id && pathNode.node.id.name) {
            const name = pathNode.node.id.name;
            if (actions.unusedFunctions.includes(name) && pathNode.parent.type !== 'ExportNamedDeclaration') {
              pathNode.remove();
            }
          }
        }
      });

      const output = generate(ast, { retainLines: true }, code);
      fs.writeFileSync(file, output.code, 'utf-8');
      console.log(`Cleaned up unused code in: ${path.relative(process.cwd(), file)}`);
    } catch (err) {
      console.error(`Failed to clean file ${file}: ${err.message}`);
    }
  }
}
