import { execSync } from 'child_process';
import path from 'path';

/**
 * Returns Git information for a given file (last modification relative date, author).
 * Falls back to null if Git commands fail.
 * @param {string} filePath - absolute file path
 * @returns {object|null} { relativeDate, author } or null
 */
export function getGitHistory(filePath) {
  try {
    const dir = path.dirname(filePath);
    const cmd = `git log -1 --format="%ar|%an" -- "${filePath}"`;
    const output = execSync(cmd, {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
    }).trim();

    if (output) {
      const parts = output.split('|');
      return {
        relativeDate: parts[0] || 'unknown time',
        author: parts[1] || 'unknown author',
      };
    }
  } catch (e) {
    // Git is not available, or not a git repo, or file is untracked
  }
  return null;
}
