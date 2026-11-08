// The two ways the service's clock fires runCron. On Cloudflare, `[triggers]` in wrangler.toml calls `scheduled`.
// workerd has no cron triggers, so a self-hosted service is driven by a timer outside it (selfhost/ runs one) that
// posts to the cron door. Cloudflare never sets CRON_SECRET, so the door stays shut there. The body names the schedule
// as wrangler.toml writes it, and the door runs the same jobs that `scheduled` runs.
import { runCron } from './cron.js';
import { timingSafeEqual } from './password.js';

export const CRON_DOOR_PATH = '/__cron';
export const CRON_SECRET_HEADER = 'x-cron-secret';
const BODY_MAX_CHARS = 256;

type CronEnv = { CRON_SECRET?: unknown };
type Controller = { cron?: string; scheduledTime?: number } | null | undefined;
type JobReport = Awaited<ReturnType<typeof runCron>>;

/** The Worker's `scheduled` handler. */
export const scheduled = (controller: Controller, env: CronEnv): Promise<JobReport> =>
  runCron(env, { cron: controller?.cron, nowS: Math.floor(Number(controller?.scheduledTime ?? Date.now()) / 1000) });

const sha256 = async (text: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

// Both sides are hashed first so the comparison reads equal lengths and the time says nothing about the secret's length.
async function secretMatches(given: string | null, secret: string): Promise<boolean> {
  if (given === null) return false;
  return timingSafeEqual(await sha256(given), await sha256(secret));
}

async function cronOf(request: Request): Promise<string | null> {
  const text = await request.text();
  if (text.length > BODY_MAX_CHARS) return null;
  try {
    const body: unknown = JSON.parse(text);
    if (body === null || typeof body !== 'object') return null;
    const cron: unknown = (body as { cron?: unknown }).cron;
    return typeof cron === 'string' ? cron : null;
  } catch {
    return null;
  }
}

const secretOf = (env: CronEnv): string => (typeof env?.CRON_SECRET === 'string' ? env.CRON_SECRET : '');

/** True for a request to the door while CRON_SECRET is set. Unset, the path is the service's like any other unknown one. */
export const isCronDoor = (request: Request, env: CronEnv): boolean =>
  secretOf(env) !== '' && new URL(request.url).pathname === CRON_DOOR_PATH;

/** Answers a request that isCronDoor passed: 405 for any method but POST, 401 for a missing or wrong secret, 400 for a body without a `cron` string, else 200 with `runCron`'s report. */
export async function cronDoor(request: Request, env: CronEnv): Promise<Response> {
  if (request.method !== 'POST') return new Response('method', { status: 405, headers: { allow: 'POST' } });
  if (!(await secretMatches(request.headers.get(CRON_SECRET_HEADER), secretOf(env))))
    return new Response('unauthorized', { status: 401 });
  const cron = await cronOf(request);
  if (cron === null) return new Response('cron', { status: 400 });
  const jobs = await runCron(env, { cron, nowS: Math.floor(Date.now() / 1000) });
  return Response.json({ cron, jobs });
}
