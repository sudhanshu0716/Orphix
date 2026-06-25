import path from 'path';
import fs from 'fs';

const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json'];

// Helper to strip comments and parse JSON
function parseJsonWithComments(content) {
  const clean = content.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
  return JSON.parse(clean);
}

export function resolveAlias(importerPath, source) {
  // Walk up from importerPath's directory to find the nearest tsconfig.json or jsconfig.json
  let currentDir = path.dirname(importerPath);
  let configPath = null;
  let aliases = null;
  let projectRoot = null;

  while (currentDir && currentDir !== path.dirname(currentDir)) {
    for (const file of ['tsconfig.json', 'jsconfig.json']) {
      const p = path.join(currentDir, file);
      if (fs.existsSync(p)) {
        configPath = p;
        projectRoot = currentDir;
        break;
      }
    }
    if (configPath) break;
    currentDir = path.dirname(currentDir);
  }

  // If no tsconfig/jsconfig found, look for package.json to establish projectRoot for ~/ fallback
  if (!projectRoot) {
    currentDir = path.dirname(importerPath);
    while (currentDir && currentDir !== path.dirname(currentDir)) {
      if (fs.existsSync(path.join(currentDir, 'package.json'))) {
        projectRoot = currentDir;
        break;
      }
      currentDir = path.dirname(currentDir);
    }
  }

  if (configPath) {
    try {
      const config = parseJsonWithComments(fs.readFileSync(configPath, 'utf-8'));
      if (config.compilerOptions && config.compilerOptions.paths) {
        aliases = {
          baseUrl: config.compilerOptions.baseUrl || '.',
          paths: config.compilerOptions.paths
        };
      }
    } catch (e) {
      // ignore parsing errors
    }
  }

  if (!aliases) {
    if (source.startsWith('~/') && projectRoot) {
      return path.resolve(projectRoot, source.slice(2));
    }
    return null;
  }

  const { baseUrl, paths } = aliases;
  const baseDir = path.resolve(projectRoot, baseUrl);

  for (const [pattern, targetTemplates] of Object.entries(paths)) {
    const hasWildcard = pattern.includes('*');
    if (hasWildcard) {
      const prefix = pattern.replace('*', '');
      if (source.startsWith(prefix)) {
        const wildcardVal = source.slice(prefix.length);
        for (const template of targetTemplates) {
          const resolvedTemplate = template.replace('*', wildcardVal);
          return path.resolve(baseDir, resolvedTemplate);
        }
      }
    } else {
      if (source === pattern) {
        for (const template of targetTemplates) {
          return path.resolve(baseDir, template);
        }
      }
    }
  }

  if (source.startsWith('~/') && projectRoot) {
    return path.resolve(projectRoot, source.slice(2));
  }

  return null;
}

// Resolves import path relative to the importing file (handling aliases & index files)
export function resolveImport(importerPath, source) {
  let targetPath = resolveAlias(importerPath, source);

  if (!targetPath) {
    if (source.startsWith('@/')) {
      let currentDir = path.dirname(importerPath);
      let projectRoot = null;
      while (currentDir && currentDir !== path.dirname(currentDir)) {
        if (fs.existsSync(path.join(currentDir, 'package.json'))) {
          projectRoot = currentDir;
          break;
        }
        currentDir = path.dirname(currentDir);
      }
      if (projectRoot) {
        const srcDir = path.join(projectRoot, 'src');
        if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
          targetPath = path.resolve(srcDir, source.slice(2));
        } else {
          targetPath = path.resolve(projectRoot, source.slice(2));
        }
      }
    }
  }

  if (!targetPath) {
    // If it doesn't start with . or / or \, treat as third-party / external
    if (!source.startsWith('.') && !path.isAbsolute(source)) {
      return null;
    }

    const importerDir = path.dirname(importerPath);
    targetPath = path.resolve(importerDir, source);
  }

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

// Resolves a dynamic import directory source path relative to the importing file
export function resolveImportDir(importerPath, source) {
  let targetPath = resolveAlias(importerPath, source);

  if (!targetPath) {
    if (source.startsWith('@/')) {
      let currentDir = path.dirname(importerPath);
      let projectRoot = null;
      while (currentDir && currentDir !== path.dirname(currentDir)) {
        if (fs.existsSync(path.join(currentDir, 'package.json'))) {
          projectRoot = currentDir;
          break;
        }
        currentDir = path.dirname(currentDir);
      }
      if (projectRoot) {
        const srcDir = path.join(projectRoot, 'src');
        if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
          targetPath = path.resolve(srcDir, source.slice(2));
        } else {
          targetPath = path.resolve(projectRoot, source.slice(2));
        }
      }
    }
  }

  if (!targetPath) {
    if (!source.startsWith('.') && !path.isAbsolute(source)) {
      return null;
    }
    const importerDir = path.dirname(importerPath);
    targetPath = path.resolve(importerDir, source);
  }

  // Only check the path itself or its direct parent directory to avoid walking up to root
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    return targetPath;
  }
  const parent = path.dirname(targetPath);
  if (fs.existsSync(parent) && fs.statSync(parent).isDirectory()) {
    return parent;
  }
  return null;
}

// Find distinct project roots containing a package.json, walking up from file dirs.
export function findProjectRoots(allFiles, targetDir) {
  const roots = new Set();
  const targetDirResolved = path.resolve(targetDir);
  roots.add(targetDirResolved);

  for (const file of allFiles) {
    let currentDir = path.dirname(file);
    while (currentDir.startsWith(targetDirResolved) && currentDir !== targetDirResolved) {
      if (fs.existsSync(path.join(currentDir, 'package.json'))) {
        roots.add(currentDir);
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
  }

  // Sort by length descending so that the deepest matching path matches first
  return Array.from(roots).sort((a, b) => b.length - a.length);
}

// Check if a directory is a Next.js project.
function isNextJSProject(dir) {
  if (
    fs.existsSync(path.join(dir, 'next.config.js')) ||
    fs.existsSync(path.join(dir, 'next.config.mjs')) ||
    fs.existsSync(path.join(dir, 'next.config.ts'))
  ) {
    return true;
  }
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (
        (pkg.dependencies && pkg.dependencies.next) ||
        (pkg.devDependencies && pkg.devDependencies.next)
      ) {
        return true;
      }
    } catch (e) {}
  }
  return false;
}

// Build the dependency graph and return reachability info.
export function buildDependencyGraph(allFiles, parsedFiles, explicitEntryPoints = [], targetDir = '.') {
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
      if (imp.isDynamicDir) {
        const resolvedDir = resolveImportDir(file, imp.source);
        if (resolvedDir) {
          // Find all files in allFiles that lie within this resolved directory
          for (const targetFile of allFiles) {
            if (targetFile.startsWith(resolvedDir)) {
              if (!graph[file].includes(targetFile)) {
                graph[file].push(targetFile);
              }
              if (!incomingImports[targetFile].includes(file)) {
                incomingImports[targetFile].push(file);
              }
            }
          }
        }
      } else {
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
  }

  // Determine entry points
  let entryPoints = [];
  if (explicitEntryPoints && explicitEntryPoints.length > 0) {
    entryPoints = explicitEntryPoints.map(f => path.resolve(f));
  } else {
    // 1. Find all project roots
    const projectRoots = findProjectRoots(allFiles, targetDir);

    // 2. Group files by their project root
    const groups = {};
    for (const root of projectRoots) {
      groups[root] = [];
    }
    for (const file of allFiles) {
      for (const root of projectRoots) {
        if (file.startsWith(root)) {
          groups[root].push(file);
          break;
        }
      }
    }

    // 3. Detect entry points for each group independently
    for (const root of projectRoots) {
      const groupFiles = groups[root];
      if (!groupFiles || groupFiles.length === 0) continue;

      const isNext = isNextJSProject(root);
      let groupEntryPoints = [];

      if (isNext) {
        // Auto-detect framework files (Next.js layout/page/route)
        const nextjsPatterns = [
          /\/pages\/.*\.[jt]sx?$/,
          /\/app\/.*\/page\.[jt]sx?$/,
          /\/app\/.*\/layout\.[jt]sx?$/,
          /\/app\/.*\/route\.[jt]s$/,
        ];

        groupEntryPoints = groupFiles.filter(file => {
          const normalizedPath = file.replace(/\\/g, '/');
          return nextjsPatterns.some(pattern => pattern.test(normalizedPath));
        });
      }

      if (groupEntryPoints.length === 0) {
        // Auto-detect: files with no incoming imports from within the SAME project group
        const zeroIncoming = groupFiles.filter(file => {
          const incoming = incomingImports[file] || [];
          const localIncoming = incoming.filter(f => groupFiles.includes(f));
          return localIncoming.length === 0;
        });

        if (zeroIncoming.length > 1) {
          const commonNames = ['index', 'main', 'app', 'server', 'run', 'cli'];
          const matchingCommon = zeroIncoming.filter(file => {
            const base = path.basename(file, path.extname(file)).toLowerCase();
            return commonNames.includes(base);
          });
          if (matchingCommon.length > 0) {
            groupEntryPoints = matchingCommon;
          } else {
            groupEntryPoints = zeroIncoming;
          }
        } else {
          groupEntryPoints = zeroIncoming;
        }

        // If everything is cyclic or we have no obvious entries, check common files
        if (groupEntryPoints.length === 0 && groupFiles.length > 0) {
          const commonNames = ['index', 'main', 'app', 'server', 'run', 'cli'];
          groupEntryPoints = groupFiles.filter(file => {
            const base = path.basename(file, path.extname(file)).toLowerCase();
            return commonNames.includes(base);
          });
          // Fallback to the first file if still empty
          if (groupEntryPoints.length === 0) {
            groupEntryPoints = [groupFiles[0]];
          }
        }
      }

      entryPoints.push(...groupEntryPoints);
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
