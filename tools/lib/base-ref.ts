// The ref a branch's changes are measured against: the branch its pull request merges into. The changed-files tools
// (tools/testChanged.mjs, tools/check-changed.mjs, tools/comment-refs.ts and tools/pre-push.ts) share it, so they all
// read the same diff.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface PackageConfig {
  config?: { baseRef?: unknown };
}

/** package.json's `config.baseRef`. A repository that merges into another branch changes that one line. */
export function configuredBaseRef(root: string): string {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageConfig;
  const ref = pkg.config?.baseRef;
  if (typeof ref !== 'string' || ref === '') {
    throw new Error('package.json has no config.baseRef: set it to the remote branch pull requests merge into');
  }
  return ref;
}

/**
 * The base ref: `--base <ref>` among `argv`, else `$BASE_REF` (CI sets it to the pull request's base), else
 * package.json's `config.baseRef`. The branch's upstream is not used: after `git push -u` it is the branch's own
 * remote copy, and a diff against it is empty.
 */
export function baseRef(argv: readonly string[], root: string, env: NodeJS.ProcessEnv = process.env): string {
  const at = argv.indexOf('--base');
  if (at >= 0) {
    const given = argv[at + 1];
    if (!given || given.startsWith('--')) throw new Error('--base wants a ref');
    return given;
  }
  if (env.BASE_REF) return env.BASE_REF;
  return configuredBaseRef(root);
}
