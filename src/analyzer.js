import path from 'path';
import { scanFiles } from './scanner.js';
import { parseFile } from './parser.js';
import { buildDependencyGraph, resolveImport } from './graph.js';
import { getGitHistory } from './git.js';

function getApiEndpoint(relativeFile) {
  const clean = relativeFile.replace(/\\/g, '/');
  
  // 1. Pages Router: pages/api/xyz.js or src/pages/api/xyz.js (supporting subfolders)
  let match = clean.match(/(?:^|\/)pages\/api\/(.+)\.[jt]sx?$/);
  if (match) {
    let endpoint = match[1];
    if (endpoint.endsWith('/index')) {
      endpoint = endpoint.slice(0, -6);
    }
    return `/api/${endpoint}`;
  }
  
  // 2. App Router: app/api/xyz/route.js or src/app/api/xyz/route.js (supporting subfolders)
  match = clean.match(/(?:^|\/)app\/api\/(.+)\/route\.[jt]sx?$/);
  if (match) {
    return `/api/${match[1]}`;
  }

  return null;
}

/**
 * Perform analysis on a target directory.
 * @param {string} targetDir
 * @param {object} options
 * @returns {Promise<object>} report results
 */
export async function analyzeProject(targetDir, options = {}) {
  const files = await scanFiles(targetDir, options);
  
  const parsedFiles = {};
  const parseErrors = [];

  // Parse all found files
  for (const file of files) {
    try {
      parsedFiles[file] = parseFile(file);
    } catch (err) {
      parseErrors.push({
        file,
        error: err.message,
      });
    }
  }

  // Build dependency graph
  const { graph, incomingImports, reachable, entryPoints } = buildDependencyGraph(
    files,
    parsedFiles,
    options.entryPoints,
    targetDir
  );

  const unusedFiles = [];
  const unusedExports = [];
  const unusedFunctions = [];

  // 1. Identify unused (orphan) files
  for (const file of files) {
    if (!reachable.has(file)) {
      const gitInfo = options.git ? getGitHistory(file) : null;
      const fileData = parsedFiles[file];
      const importsCount = fileData ? fileData.imports.length : 0;
      
      let confidence = 90;
      if (importsCount === 0) {
        confidence = 99; // Completely isolated file
      }

      if (gitInfo && (gitInfo.relativeDate.includes('month') || gitInfo.relativeDate.includes('year'))) {
        confidence = Math.min(99, confidence + 5);
      }

      unusedFiles.push({
        file,
        relativeFile: path.relative(targetDir, file),
        gitInfo,
        confidence,
      });
    }
  }

  // 2. Build used exports map with re-export propagation
  const usedExportsMap = {};
  for (const file of files) {
    usedExportsMap[file] = new Set();
  }

  // Mark all exports of entry points as used
  for (const file of entryPoints) {
    const fileData = parsedFiles[file];
    if (fileData) {
      for (const exp of fileData.exports) {
        usedExportsMap[file].add(exp.name);
      }
    }
  }

  // Populate directly used exports from standard imports
  for (const file of files) {
    const fileData = parsedFiles[file];
    if (!fileData) continue;

    for (const imp of fileData.imports) {
      const resolved = resolveImport(file, imp.source);
      if (resolved && usedExportsMap[resolved]) {
        if (!imp.isReexport) {
          if (imp.isNamespace) {
            const targetData = parsedFiles[resolved];
            if (targetData) {
              for (const exp of targetData.exports) {
                usedExportsMap[resolved].add(exp.name);
              }
            }
          } else {
            for (const spec of imp.specifiers) {
              usedExportsMap[resolved].add(spec);
            }
          }
        }
      }
    }
  }

  // Propagate through re-export chains (wildcard and named re-exports)
  let changed = true;
  while (changed) {
    changed = false;
    for (const file of files) {
      const fileData = parsedFiles[file];
      if (!fileData) continue;

      for (const imp of fileData.imports) {
        if (imp.isReexport) {
          const resolved = resolveImport(file, imp.source);
          if (resolved && usedExportsMap[resolved]) {
            if (imp.isNamespace) {
              const resolvedData = parsedFiles[resolved];
              if (resolvedData) {
                for (const exp of resolvedData.exports) {
                  if (usedExportsMap[file].has(exp.name)) {
                    if (!usedExportsMap[resolved].has(exp.name)) {
                      usedExportsMap[resolved].add(exp.name);
                      changed = true;
                    }
                  }
                }
              }
            } else {
              if (imp.reexportMap) {
                for (const [exportedName, localName] of Object.entries(imp.reexportMap)) {
                  if (usedExportsMap[file].has(exportedName)) {
                    if (!usedExportsMap[resolved].has(localName)) {
                      usedExportsMap[resolved].add(localName);
                      changed = true;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // 3. Identify unused exports and functions in REACHABLE files
  for (const file of files) {
    if (!reachable.has(file)) continue;

    const fileData = parsedFiles[file];
    if (!fileData) continue;

    const relativeFile = path.relative(targetDir, file);

    // Calculate used exports for this file
    const isEntryPoint = entryPoints.includes(file);
    let unusedFileExports = [];

    if (!isEntryPoint) {
      for (const exp of fileData.exports) {
        if (!usedExportsMap[file].has(exp.name)) {
          unusedFileExports.push(exp);
        }
      }
    }

    // Add unused exports to report
    for (const exp of unusedFileExports) {
      const gitInfo = options.git ? getGitHistory(file) : null;
      const isReferencedLocally = fileData.referencedNames.includes(exp.name);
      const confidence = isReferencedLocally ? 85 : 99;

      unusedExports.push({
        file,
        relativeFile,
        name: exp.name,
        line: exp.line,
        gitInfo,
        confidence,
      });
    }

    // 3. Identify unused local functions and React components
    // A function/component is unused if:
    // - It is not exported (or it is exported but its export is unused)
    // - AND it is not referenced internally in the file
    const unusedExportNames = new Set(unusedFileExports.map(e => e.name));
    
    for (const fn of fileData.localFunctions) {
      const isExported = fileData.exportedNames.includes(fn.name);
      const isExportUnused = unusedExportNames.has(fn.name);
      const isReferencedLocally = fileData.referencedNames.includes(fn.name);

      let isUnused = false;
      if (!isExported && !isReferencedLocally) {
        isUnused = true;
      } else if (isExported && isExportUnused && !isReferencedLocally) {
        // Export is dead AND not called internally
        isUnused = true;
      }

      if (isUnused) {
        const gitInfo = options.git ? getGitHistory(file) : null;
        const confidence = !isExported ? 99 : 95;

        unusedFunctions.push({
          file,
          relativeFile,
          name: fn.name,
          line: fn.line,
          isReactComponent: fn.isReactComponent,
          gitInfo,
          confidence,
        });
      }
    }
  }

  // 3b. Identify unused imports in reachable files
  const unusedImports = [];
  for (const file of files) {
    if (!reachable.has(file)) continue;
    const fileData = parsedFiles[file];
    if (!fileData) continue;

    const relativeFile = path.relative(targetDir, file);

    for (const imp of fileData.imports) {
      if (imp.isReexport) continue;
      if (imp.localImports) {
        for (const localImp of imp.localImports) {
          const isReferenced = fileData.referencedNames.includes(localImp.localName);
          const isExported = fileData.exportedNames.includes(localImp.localName);
          if (!isReferenced && !isExported) {
            const gitInfo = options.git ? getGitHistory(file) : null;
            unusedImports.push({
              file,
              relativeFile,
              name: localImp.localName,
              source: imp.source,
              confidence: 99,
              gitInfo,
            });
          }
        }
      }
    }
  }

  // 4. Identify potentially dead API routes
  const apiRoutes = [];
  for (const file of files) {
    const relativeFile = path.relative(targetDir, file);
    const endpoint = getApiEndpoint(relativeFile);
    if (endpoint) {
      apiRoutes.push({ file, relativeFile, endpoint });
    }
  }

  const allStringLiterals = new Set();
  for (const file of files) {
    const fileData = parsedFiles[file];
    if (fileData && fileData.stringLiterals) {
      for (const str of fileData.stringLiterals) {
        allStringLiterals.add(str);
      }
    }
  }

  const deadApis = [];
  for (const route of apiRoutes) {
    let isUsed = false;
    for (const str of allStringLiterals) {
      if (str.includes(route.endpoint)) {
        isUsed = true;
        break;
      }
    }

    if (!isUsed) {
      const gitInfo = options.git ? getGitHistory(route.file) : null;
      deadApis.push({
        file: route.file,
        relativeFile: route.relativeFile,
        endpoint: route.endpoint,
        confidence: 90,
        gitInfo,
      });
    }
  }

  return {
    entryPoints: entryPoints.map(f => path.relative(targetDir, f)),
    unusedFiles,
    unusedExports,
    unusedFunctions,
    unusedImports,
    deadApis,
    parseErrors,
  };
}
