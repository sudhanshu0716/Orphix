import path from 'path';
import fs from 'fs';

const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json'];

/**
 * Resolves an import source path relative to the importing file.
 * @param {string} importerPath - absolute path of the importing file
 * @param {string} source - raw import string
 * @returns {string|null} resolved absolute file path or null if external/unresolved
 */
export function resolveImport(importerPath, source) {
  // If it doesn't start with . or / or \, treat as third-party / external
  if (!source.startsWith('.') && !path.isAbsolute(source)) {
    return null;
  }

  const importerDir = path.dirname(importerPath);
  const targetPath = path.resolve(importerDir, source);

  // 1. Direct file check
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
    return targetPath;
  }

  // 2. Try file with extensions
  for (const ext of EXTENSIONS) {
    const fileWithExt = targetPath + ext;
    if (fs.existsSync(fileWithExt) && fs.statSync(fileWithExt).isFile()) {
      return fileWithExt;
    }
  }

  // 3. Try directory index check
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    for (const ext of EXTENSIONS) {
      const indexFile = path.join(targetPath, `index${ext}`);
      if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
        return indexFile;
      }
    }
  }

  return null;
}

/**
 * Builds the dependency graph and returns reachability info.
 * @param {string[]} allFiles - list of all project files
 * @param {object} parsedFiles - map of file paths to their parsed imports/exports
 * @param {string[]} [explicitEntryPoints] - list of entry point files
 * @returns {object} { graph, reachable, entryPoints }
 */
export function buildDependencyGraph(allFiles, parsedFiles, explicitEntryPoints = []) {
  const graph = {}; // parent -> child[]
  const incomingImports = {}; // child -> parent[]

  // Initialize graph structures
  for (const file of allFiles) {
    graph[file] = [];
    incomingImports[file] = [];
  }

  // Populate graph
  for (const file of allFiles) {
    const fileData = parsedFiles[file];
    if (!fileData) continue;

    for (const imp of fileData.imports) {
      const resolved = resolveImport(file, imp.source);
      if (resolved && graph[resolved]) {
        if (!graph[file].includes(resolved)) {
          graph[file].push(resolved);
        }
        if (!incomingImports[resolved].includes(file)) {
          incomingImports[resolved].push(file);
        }
      }
    }
  }

  // Determine entry points
  let entryPoints = [];
  if (explicitEntryPoints && explicitEntryPoints.length > 0) {
    entryPoints = explicitEntryPoints.map(f => path.resolve(f));
  } else {
    // Auto-detect framework files (Next.js layout/page/route)
    const nextjsPatterns = [
      /\/pages\/.*\.[jt]sx?$/,
      /\/app\/.*\/page\.[jt]sx?$/,
      /\/app\/.*\/layout\.[jt]sx?$/,
      /\/app\/.*\/route\.[jt]s$/,
    ];

    const frameworkEntryPoints = allFiles.filter(file => {
      const normalizedPath = file.replace(/\\/g, '/');
      return nextjsPatterns.some(pattern => pattern.test(normalizedPath));
    });

    if (frameworkEntryPoints.length > 0) {
      entryPoints = frameworkEntryPoints;
    } else {
      // Auto-detect: files with no incoming imports
      entryPoints = allFiles.filter(file => incomingImports[file].length === 0);

      // If everything is cyclic or we have no obvious entries, check common files
      if (entryPoints.length === 0 && allFiles.length > 0) {
        const commonNames = ['index', 'main', 'app'];
        entryPoints = allFiles.filter(file => {
          const base = path.basename(file, path.extname(file)).toLowerCase();
          return commonNames.includes(base);
        });
        // Fallback to the first file if still empty
        if (entryPoints.length === 0) {
          entryPoints = [allFiles[0]];
        }
      }
    }
  }

  // Traverse graph using DFS to find all reachable files
  const reachable = new Set();
  const queue = [...entryPoints];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!reachable.has(current)) {
      reachable.add(current);
      const dependencies = graph[current] || [];
      for (const dep of dependencies) {
        if (!reachable.has(dep)) {
          queue.push(dep);
        }
      }
    }
  }

  return {
    graph,
    incomingImports,
    reachable,
    entryPoints,
  };
}
