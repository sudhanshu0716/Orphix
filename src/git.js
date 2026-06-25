import { execFileSync } from 'child_process';
import path from 'path';

// Get last commit date and author name for a file. Returns null on error/untracked.
export function getGitHistory(filePath) {
  try {
    const dir = path.dirname(filePath);
    const output = execFileSync(
      'git',
      ['log', '-1', '--format=%ar|%an', '--', filePath],
      {
        cwd: dir,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
      }
    ).trim();

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
