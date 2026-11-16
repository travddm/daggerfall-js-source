/** The checks that run on a pull request's changed files only (docs/coding-standards.md, "Tooling"). */
export type Checker = 'prettier' | 'markdownlint' | 'cspell';

const EXTENSIONS: Record<Checker, readonly string[]> = {
  prettier: ['.js', '.mjs', '.cjs', '.ts', '.mts', '.json', '.jsonc', '.md', '.yml', '.yaml', '.css'],
  markdownlint: ['.md'],
  cspell: ['.md', '.txt', '.yml', '.yaml'],
};

/** The extension of the last path segment, lower-case, or '' for a name with none (or a dotfile such as `.prettierrc`). */
function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

/** The paths among `paths` that `checker` reads, in their given order. Paths use `/`. */
export function pathsFor(checker: Checker, paths: readonly string[]): string[] {
  const extensions = EXTENSIONS[checker];
  return paths.filter((path) => extensions.includes(extensionOf(path)));
}

/** Splits `paths` into runs whose joined length stays under `budget`, because Windows caps a command line near 32,000 characters. */
export function batchPaths(paths: readonly string[], budget: number): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let used = 0;
  for (const path of paths) {
    const cost = path.length + 3;
    if (batch.length > 0 && used + cost > budget) {
      batches.push(batch);
      batch = [];
      used = 0;
    }
    batch.push(path);
    used += cost;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}
