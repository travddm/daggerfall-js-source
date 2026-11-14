// One command for the checks a pull request's CI runs (.github/workflows/verify.yml and check.yml), scoped to what this
// branch changed against its base (tools/lib/base-ref.ts). Every step runs, so one run reports every failure, and the
// exit status is 1 when any step failed.
//
//   npm run pre-push                    # every step
//   npm run pre-push -- --full          # also run every far test here, however many
//   npm run pre-push -- --base <ref>    # measure the changes against another ref
//
// Steps: the installed dependencies, lint and its ratchet, both type passes, the formatting of added files, markdown,
// spelling, the references in added comments, the shaders when one changed, and the tests tools/testChanged.mjs
// selects. CI still runs every test and the build. This command does not build: the build is slow, and on Windows
// it can fail with EMFILE for reasons outside the branch (CONTRIBUTING.md).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isMain } from './lib/isMain.mjs';
import { baseRef } from './lib/base-ref.ts';
import { changedFiles, selectTests } from './testChanged.mjs';
import { runTests, testFiles } from './testShards.mjs';

const ROOT = join(import.meta.dirname, '..');

/** A test selection larger than this share of the suite runs only its near tier, unless `--full` is given. */
export const FAR_TIER_SHARE = 0.25;

export type Outcome = 'passed' | 'failed' | 'skipped' | 'warned';

export interface StepResult {
  outcome: Outcome;
  note?: string;
}

interface PackageJson {
  devDependencies?: Record<string, string>;
}

interface PackageLock {
  packages?: Record<string, { version?: string }>;
}

/**
 * The problems with `root`'s installed dev dependencies: a package missing from `root/node_modules`, or one whose
 * version differs from the lockfile's. A worktree whose `node_modules` links to an install made for another branch
 * fails here, by name, instead of later as a type error about a missing `@types/node`.
 */
export function installProblems(root: string): string[] {
  if (!existsSync(join(root, 'node_modules'))) {
    return [
      'no node_modules here: Node would resolve packages from a folder above this checkout, an install made for another branch',
    ];
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageJson;
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as PackageLock;
  const problems: string[] = [];
  for (const name of Object.keys(pkg.devDependencies ?? {})) {
    const manifest = join(root, 'node_modules', name, 'package.json');
    if (!existsSync(manifest)) {
      problems.push(`${name} is not installed`);
      continue;
    }
    const installed = (JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string }).version;
    const locked = lock.packages?.[`node_modules/${name}`]?.version;
    if (locked && installed !== locked) problems.push(`${name} is ${installed}, the lockfile wants ${locked}`);
  }
  return problems;
}

/** The Node major version CI's verify job runs (`node-version` in .github/workflows/verify.yml), or null. */
export function ciNodeMajor(workflow: string): number | null {
  const match = /node-version:\s*["']?(\d+)/.exec(workflow);
  return match ? Number(match[1]) : null;
}

/** Whether a changed file is a shader stage or chunk that tools/glsl-check.ts compiles. */
export function changesShaders(changed: readonly string[]): boolean {
  return changed.some((path) => /\.(vert|frag|glsl)$/.test(path) || path === 'tools/glsl-check.ts');
}

/**
 * The test files to run here: the near tier always, and the far tier too when `full` is set or the whole selection
 * stays within `FAR_TIER_SHARE` of the suite. A larger far tier is left to CI, so several sessions can run this
 * command on one machine at once.
 */
export function testsToRun(near: readonly string[], far: readonly string[], suiteSize: number, full: boolean) {
  const runFar = full || near.length + far.length <= suiteSize * FAR_TIER_SHARE;
  return { files: runFar ? [...near, ...far] : [...near], leftToCi: runFar ? 0 : far.length };
}

/** Runs a command in the repository with its output shown, and answers its exit status. */
function run(command: string, args: string[]): number {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.error) console.error(`[pre-push] ${command} did not start: ${result.error.message}`);
  return result.status ?? 1;
}

/** An npm script, through the npm that started this command when there is one (Windows has no plain `npm` binary). */
function npmRun(script: string): number {
  const npmCli = process.env.npm_execpath;
  if (npmCli) return run(process.execPath, [npmCli, 'run', script]);
  const result = spawnSync(`npm run ${script}`, { cwd: ROOT, stdio: 'inherit', shell: true });
  return result.status ?? 1;
}

const statusResult = (status: number): StepResult => ({ outcome: status === 0 ? 'passed' : 'failed' });

function main(argv: string[]): number {
  const base = baseRef(argv, ROOT);
  const full = argv.includes('--full');
  const changed = changedFiles(base, ROOT) as string[];
  console.log(`[pre-push] ${changed.length} changed files against ${base}`);

  const problems = installProblems(ROOT);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`[pre-push] ${problem}`);
    console.error(
      "[pre-push] install this branch's dependencies (npm ci, or link node_modules to an install of the base), then run again",
    );
    return 1;
  }

  const node = (script: string, ...args: string[]) => statusResult(run(process.execPath, [script, ...args]));
  const steps: [string, () => StepResult][] = [
    [
      'node version',
      () => {
        const ci = ciNodeMajor(readFileSync(join(ROOT, '.github/workflows/verify.yml'), 'utf8'));
        const here = Number(process.versions.node.split('.')[0]);
        if (ci === null || ci === here) return { outcome: 'passed' };
        // A different V8 can change what a timing or allocation test measures.
        return {
          outcome: 'warned',
          note: `Node ${process.versions.node} here, CI runs Node ${ci}; results can differ`,
        };
      },
    ],
    ['lint', () => statusResult(npmRun('lint'))],
    ['lint ratchet is current', () => node('tools/lintRatchet.mjs', '--strict')],
    ['types (both passes)', () => statusResult(npmRun('types'))],
    ['formatting of added files', () => node('tools/check-changed.mjs', 'format-check', '--added', '--base', base)],
    ['markdown', () => node('tools/check-changed.mjs', 'markdown', '--base', base)],
    ['spelling', () => node('tools/check-changed.mjs', 'spell', '--base', base)],
    ['comment references', () => node('tools/comment-refs.ts', '--base', base)],
    [
      'shaders',
      () => {
        if (!changesShaders(changed)) return { outcome: 'skipped', note: 'no shader changed' };
        const status = run(process.execPath, ['tools/glsl-check.ts']);
        // glsl-check answers 2 when glslangValidator is not installed.
        if (status === 2)
          return { outcome: 'skipped', note: 'glslangValidator is not installed; CI compiles the shaders' };
        return statusResult(status);
      },
    ],
    [
      'tests',
      () => {
        const tests = testFiles(ROOT) as string[];
        const { everything, near, far } = selectTests(changed, tests, ROOT) as {
          everything: boolean;
          near: string[];
          far: string[];
        };
        const { files, leftToCi } = testsToRun(near, far, tests.length, full);
        const why = everything ? ' (a file every test leans on changed)' : '';
        console.log(
          `[pre-push] tests${why}: ${near.length} near and ${far.length} far of ${tests.length}; running ${files.length}`,
        );
        // As `npm run test:changed` does first: tests read the vendored mods' published files, which git does not hold.
        if (run('sh', ['tools/fetch-vendor.sh']) !== 0)
          return { outcome: 'failed', note: 'tools/fetch-vendor.sh failed' };
        const status = runTests(files) as number;
        const note = leftToCi > 0 ? `${leftToCi} far tests left to CI; --full runs them here` : undefined;
        return { ...statusResult(status), note };
      },
    ],
  ];

  const results: [string, StepResult, number][] = [];
  for (const [name, step] of steps) {
    console.log(`\n[pre-push] ${name}`);
    const started = Date.now();
    results.push([name, step(), (Date.now() - started) / 1000]);
  }

  console.log('\n[pre-push] summary');
  for (const [name, result, seconds] of results) {
    const note = result.note ? `  (${result.note})` : '';
    console.log(`  ${result.outcome.padEnd(7)} ${name.padEnd(26)} ${seconds.toFixed(0).padStart(4)} s${note}`);
  }
  return results.some(([, result]) => result.outcome === 'failed') ? 1 : 0;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
