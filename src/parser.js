import fs from 'fs';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default || traverseModule;

/**
 * Parses a file and extracts dependencies, exports, and local declarations.
 * @param {string} filePath
 * @returns {object} AST extraction details
 */
export function parseFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf-8');
  let ast;
  try {
    ast = parse(code, {
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
  } catch (err) {
    throw new Error(`Failed to parse ${filePath}: ${err.message}`);
  }

  const imports = [];
  const exports = [];
  const localFunctions = [];
  const referencedNames = new Set();
  const exportedNames = new Set();
  const stringLiterals = new Set();

  traverse(ast, {
    ImportDeclaration(pathNode) {
      const source = pathNode.node.source.value;
      const specifiers = [];
      const localImports = [];
      let isNamespace = false;

      for (const spec of pathNode.node.specifiers) {
        const localName = spec.local.name;
        let importedName = '';
        if (spec.type === 'ImportSpecifier') {
          importedName = spec.imported.name || spec.imported.value;
        } else if (spec.type === 'ImportDefaultSpecifier') {
          importedName = 'default';
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          importedName = '*';
          isNamespace = true;
        }
        specifiers.push(importedName);
        localImports.push({ localName, importedName });
      }
      imports.push({ source, specifiers, localImports, isNamespace });
    },
    CallExpression(pathNode) {
      // Handle require('module')
      if (
        pathNode.node.callee.type === 'Identifier' &&
        pathNode.node.callee.name === 'require' &&
        pathNode.node.arguments.length === 1 &&
        pathNode.node.arguments[0].type === 'StringLiteral'
      ) {
        const source = pathNode.node.arguments[0].value;
        imports.push({ source, specifiers: [], isNamespace: true });
      }
    },
    ImportExpression(pathNode) {
      // Handle dynamic import('module')
      if (pathNode.node.source.type === 'StringLiteral') {
        const source = pathNode.node.source.value;
        imports.push({ source, specifiers: [], isNamespace: true });
      }
    },
    ExportDefaultDeclaration(pathNode) {
      exports.push({ name: 'default', isDefault: true, line: pathNode.node.loc?.start.line });
      exportedNames.add('default');
      
      const decl = pathNode.node.declaration;
      if (decl && decl.id && decl.id.type === 'Identifier') {
        exportedNames.add(decl.id.name);
      }
    },
    ExportNamedDeclaration(pathNode) {
      const line = pathNode.node.loc?.start.line;
      if (pathNode.node.declaration) {
        const decl = pathNode.node.declaration;
        if (decl.type === 'VariableDeclaration') {
          for (const d of decl.declarations) {
            if (d.id.type === 'Identifier') {
              exports.push({ name: d.id.name, isDefault: false, line });
              exportedNames.add(d.id.name);
            } else if (d.id.type === 'ObjectPattern') {
              for (const prop of d.id.properties) {
                if (prop.type === 'ObjectProperty' && prop.value.type === 'Identifier') {
                  exports.push({ name: prop.value.name, isDefault: false, line });
                  exportedNames.add(prop.value.name);
                }
              }
            }
          }
        } else if (decl.id && decl.id.type === 'Identifier') {
          exports.push({ name: decl.id.name, isDefault: false, line });
          exportedNames.add(decl.id.name);
        }
      }
      if (pathNode.node.specifiers) {
        for (const spec of pathNode.node.specifiers) {
          const name = spec.exported.name || spec.exported.value;
          exports.push({ name, isDefault: name === 'default', line });
          exportedNames.add(name);
        }
      }
      if (pathNode.node.source) {
        const source = pathNode.node.source.value;
        const specifiers = [];
        const reexportMap = {};
        if (pathNode.node.specifiers) {
          for (const spec of pathNode.node.specifiers) {
            const localName = spec.local.name || spec.local.value;
            const exportedName = spec.exported.name || spec.exported.value;
            specifiers.push(exportedName);
            reexportMap[exportedName] = localName;
          }
        }
        imports.push({ source, specifiers, reexportMap, isNamespace: false, isReexport: true });
      }
    },
    ExportAllDeclaration(pathNode) {
      // export * from './module'
      const source = pathNode.node.source.value;
      imports.push({ source, specifiers: [], isNamespace: true, isReexport: true });
    },
    FunctionDeclaration(pathNode) {
      if (pathNode.node.id && pathNode.node.id.type === 'Identifier') {
        const name = pathNode.node.id.name;
        const line = pathNode.node.loc?.start.line;
        localFunctions.push({ name, line, isReactComponent: /^[A-Z]/.test(name) });
      }
    },
    ClassDeclaration(pathNode) {
      if (pathNode.node.id && pathNode.node.id.type === 'Identifier') {
        const name = pathNode.node.id.name;
        const line = pathNode.node.loc?.start.line;
        localFunctions.push({ name, line, isReactComponent: /^[A-Z]/.test(name) });
      }
    },
    VariableDeclarator(pathNode) {
      if (
        pathNode.node.id.type === 'Identifier' &&
        pathNode.node.init &&
        (pathNode.node.init.type === 'FunctionExpression' ||
          pathNode.node.init.type === 'ArrowFunctionExpression' ||
          (pathNode.node.init.type === 'CallExpression' && pathNode.node.id.name.match(/^[A-Z]/)))
      ) {
        const name = pathNode.node.id.name;
        const line = pathNode.node.loc?.start.line;
        localFunctions.push({ name, line, isReactComponent: /^[A-Z]/.test(name) });
      }
    },
    Identifier(pathNode) {
      if (pathNode.isReferencedIdentifier()) {
        referencedNames.add(pathNode.node.name);
      }
    },
    JSXOpeningElement(pathNode) {
      const nameNode = pathNode.node.name;
      if (nameNode.type === 'JSXIdentifier') {
        referencedNames.add(nameNode.name);
      } else if (nameNode.type === 'JSXMemberExpression') {
        let obj = nameNode.object;
        while (obj.type === 'JSXMemberExpression') {
          obj = obj.object;
        }
        if (obj.type === 'JSXIdentifier') {
          referencedNames.add(obj.name);
        }
      }
    },
    AssignmentExpression(pathNode) {
      const left = pathNode.node.left;
      const right = pathNode.node.right;
      const line = pathNode.node.loc?.start.line;

      if (left.type === 'MemberExpression') {
        // Case 1: exports.foo = ...
        if (left.object.type === 'Identifier' && left.object.name === 'exports') {
          if (left.property.type === 'Identifier') {
            const name = left.property.name;
            exports.push({ name, isDefault: false, line });
            exportedNames.add(name);
          }
        }
        // Case 2: module.exports = ...
        else if (
          left.object.type === 'Identifier' &&
          left.object.name === 'module' &&
          left.property.type === 'Identifier' &&
          left.property.name === 'exports'
        ) {
          if (right.type === 'ObjectExpression') {
            for (const prop of right.properties) {
              if (prop.type === 'ObjectProperty') {
                if (prop.key.type === 'Identifier') {
                  exports.push({ name: prop.key.name, isDefault: false, line });
                  exportedNames.add(prop.key.name);
                }
              }
            }
          } else {
            exports.push({ name: 'default', isDefault: true, line });
            exportedNames.add('default');
          }
        }
        // Case 3: module.exports.foo = ...
        else if (
          left.object.type === 'MemberExpression' &&
          left.object.object.type === 'Identifier' &&
          left.object.object.name === 'module' &&
          left.object.property.type === 'Identifier' &&
          left.object.property.name === 'exports'
        ) {
          if (left.property.type === 'Identifier') {
            const name = left.property.name;
            exports.push({ name, isDefault: false, line });
            exportedNames.add(name);
          }
        }
      }
    },
    StringLiteral(pathNode) {
      stringLiterals.add(pathNode.node.value);
    },
    TemplateLiteral(pathNode) {
      for (const element of pathNode.node.quasis) {
        stringLiterals.add(element.value.cooked || element.value.raw);
      }
    }
  });

  return {
    imports,
    exports,
    localFunctions,
    referencedNames: Array.from(referencedNames),
    exportedNames: Array.from(exportedNames),
    stringLiterals: Array.from(stringLiterals),
  };
}
