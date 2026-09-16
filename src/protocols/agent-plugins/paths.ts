import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

export function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

// Resolve existing components before processing '..', preserving symlink semantics.
// Missing tails are allowed: existence at launch is not a static format requirement.
export function resolvePackagePath(root: string, relative: string): string {
  let current = root;
  for (const segment of relative.split(path.sep === '\\' ? /[/\\]/ : /\//)) {
    if (!segment || segment === '.') continue;
    if (segment === '..') { current = path.dirname(current); continue; }
    current = path.join(current, segment);
    try {
      lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    current = realpathSync(current); // Broken links and loops are not valid resolved paths.
  }
  return current;
}

export function expandPlaceholders(value: string, root: string, data: string): string {
  return value.replace(/\$\{PLUGIN_(ROOT|DATA)\}/g, (_match, variable: string) => variable === 'ROOT' ? root : data);
}
