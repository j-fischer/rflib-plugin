import * as path from 'node:path';
import { minimatch } from 'minimatch';

/**
 * Returns true if the given file system path matches the --exclude glob pattern.
 *
 * The path is normalized to forward slashes so patterns behave the same on Windows,
 * and `dot: true` lets `**` and `*` cross dot-prefixed directories, so a project
 * located under e.g. `~/.config/` or `.claude/worktrees/` is still matched.
 */
export function isExcluded(filePath: string, excludePattern?: string): boolean {
  if (!excludePattern) {
    return false;
  }
  const normalizedPath = filePath.split(path.sep).join('/');
  return minimatch(normalizedPath, excludePattern, { matchBase: true, dot: true });
}
