// Decides whether a pull request's check run is the full verification or the light one (.github/workflows/check.yml,
// probes.yml). A draft gets the light run, unless it carries the `full-ci` label or changes a file where this
// machine's platform and CI's Linux can disagree. Every other run is full: a ready pull request, a push to one, a
// manual or dispatched run.
//
//   node tools/ci-plan.ts    # reads EVENT, DRAFT and LABELS; on a draft, diffs HEAD^1 against HEAD
//
// In check.yml the checkout is the pull request's merge commit, so HEAD^1 is the base it merges into. The decision
// goes to $GITHUB_OUTPUT as `full=true` or `full=false`, and its reasons to the log and the job summary.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { isMain } from './lib/isMain.mjs';

/** The label that asks for the full verification on a draft. */
export const FULL_LABEL = 'full-ci';

export interface PlatformPath {
  pattern: RegExp;
  why: string;
}

/**
 * Changes that run the full verification on a draft too. Each is code whose behaviour can differ between a Windows
 * machine that ran `npm run pre-push` and CI's Linux, or a part the light run does not build.
 */
export const PLATFORM_PATHS: readonly PlatformPath[] = [
  { pattern: /^\.github\//, why: 'the workflows' },
  { pattern: /(^|\/)package(-lock)?\.json$/, why: 'package files' },
  { pattern: /^app\//, why: 'the desktop shell' },
  { pattern: /^selfhost\//, why: 'the server kit' },
  { pattern: /^(tools|scripts)\//, why: 'Node tooling, which handles paths and files' },
  { pattern: /^test\/[^/]+\.mjs$/, why: 'shared test helpers, which handle paths and files' },
  { pattern: /^(vite\.config\.[cm]?[jt]s|tsconfig[^/]*\.json)$/, why: 'the build and type configuration' },
];

export interface PlanInput {
  event: string;
  draft: boolean;
  labels: readonly string[];
  changed: readonly string[];
}

export interface Plan {
  full: boolean;
  reasons: string[];
}

/** The run a pull request event gets, and why. `changed` is read only for a draft. */
export function planRun({ event, draft, labels, changed }: PlanInput): Plan {
  if (event !== 'pull_request') return { full: true, reasons: [`a ${event} run`] };
  if (!draft) return { full: true, reasons: ['the pull request is ready for review'] };
  const reasons: string[] = [];
  if (labels.includes(FULL_LABEL)) reasons.push(`the ${FULL_LABEL} label`);
  for (const { pattern, why } of PLATFORM_PATHS) {
    const hits = changed.filter((path) => pattern.test(path));
    if (hits.length === 0) continue;
    const more = hits.length > 3 ? ` and ${hits.length - 3} more` : '';
    reasons.push(`${why}: ${hits.slice(0, 3).join(', ')}${more}`);
  }
  return { full: reasons.length > 0, reasons };
}

/** The labels as the workflow hands them (`toJSON` of the names), or none. */
export function parseLabels(text: string | undefined): string[] {
  if (!text) return [];
  const parsed: unknown = JSON.parse(text);
  return Array.isArray(parsed) ? parsed.filter((label): label is string => typeof label === 'string') : [];
}

function main(): void {
  const event = process.env.EVENT ?? '';
  const draft = process.env.DRAFT === 'true';
  const labels = parseLabels(process.env.LABELS);
  const needsDiff = event === 'pull_request' && draft;
  const changed = needsDiff
    ? execFileSync('git', ['diff', '--name-only', '--no-renames', 'HEAD^1', 'HEAD'], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
    : [];
  const plan = planRun({ event, draft, labels, changed });
  const verdict = plan.full ? 'full verification' : 'light run';
  const why = plan.reasons.length > 0 ? plan.reasons : ['a draft that changes no platform path'];
  const text = [`${verdict}:`, ...why.map((reason) => `- ${reason}`)].join('\n');
  console.log(text);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `full=${plan.full}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

if (isMain(import.meta.url)) main();
