import glob from 'fast-glob';
import path from 'path';
import fs from 'fs';

/**
 * Loads rules from .gitignore file if it exists.
 * @param {string} targetDir 
 * @returns {string[]} ignore patterns
 */
function loadGitignore(targetDir) {
  const gitignorePath = path.join(targetDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    return content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        // Convert typical gitignore rules to fast-glob compatible ignore entries
        let pattern = line;
        if (pattern.startsWith('/')) {
          pattern = pattern.slice(1);
        }
        if (pattern.endsWith('/')) {
          pattern = pattern + '**';
        } else if (!pattern.includes('*') && !pattern.includes('.')) {
          // It's likely a directory name
          pattern = `**/${pattern}/**`;
        }
        return pattern;
      });
  } catch (e) {
    return [];
  }
}

/**
 * Scan for JavaScript and TypeScript files.
 * @param {string} targetDir
 * @param {object} options
 * @returns {Promise<string[]>} absolute file paths
 */
export async function scanFiles(targetDir, options = {}) {
  const absoluteTargetDir = path.resolve(targetDir);
  if (!fs.existsSync(absoluteTargetDir)) {
    throw new Error(`Path does not exist: ${targetDir}`);
  }

  const isFile = fs.statSync(absoluteTargetDir).isFile();
  if (isFile) {
    return [absoluteTargetDir];
  }

  // Load custom ignore patterns from CLI arguments
  const userIgnores = options.ignore
    ? (Array.isArray(options.ignore) ? options.ignore : [options.ignore])
    : [];

  // Load gitignore rules if requested/enabled (enabled by default)
  const gitignorePatterns = options.useGitignore !== false ? loadGitignore(absoluteTargetDir) : [];

  const defaultIgnore = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/coverage/**'];
  const allIgnore = [...defaultIgnore, ...gitignorePatterns, ...userIgnores];

  // fast-glob works best with forward slashes even on Windows
  const cleanTargetDir = absoluteTargetDir.replace(/\\/g, '/');
  const globPattern = `${cleanTargetDir}/**/*.{js,jsx,ts,tsx}`;

  const files = await glob(globPattern, {
    ignore: allIgnore.map(p => p.replace(/\\/g, '/')),
    absolute: true,
    onlyFiles: true,
  });

  // Return sorted files for consistency
  return files.map(f => path.resolve(f)).sort();
}
