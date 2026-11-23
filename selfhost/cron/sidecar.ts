// The cron sidecar: at the start of each UTC minute, posts every schedule that names that minute to the account
// service's cron door, as Cloudflare's [triggers] would fire `scheduled`. The schedules are the ones generate.ts wrote
// from server-account/wrangler.toml.
//
//   CRON_SECRET=... node selfhost/cron/sidecar.ts [--door http://127.0.0.1:8788/__cron] [--schedules build/cron-schedules.txt]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { isDue, parseSchedule } from './schedule.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({
  options: {
    door: { type: 'string', default: process.env.CRON_DOOR ?? 'http://127.0.0.1:8788/__cron' },
    schedules: { type: 'string', default: join(HERE, '..', 'build', 'cron-schedules.txt') },
  },
});
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error('CRON_SECRET is unset: run node selfhost/keys.ts and pass the .env file');

const schedules = readFileSync(values.schedules, 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map(parseSchedule);
console.log(`[cron] ${schedules.map((s) => `"${s.text}"`).join(', ')} to ${values.door}`);

async function fire(cron: string): Promise<void> {
  try {
    const res = await fetch(values.door, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cron-secret': String(secret) },
      body: JSON.stringify({ cron }),
    });
    const body = (await res.json().catch(() => null)) as { jobs?: Array<{ name: string; ok: boolean }> } | null;
    const failed = body?.jobs?.filter((j) => !j.ok).map((j) => j.name) ?? [];
    if (!res.ok || failed.length > 0) console.warn(`[cron] "${cron}": ${res.status}, failed ${failed.join(', ')}`);
    else console.log(`[cron] "${cron}": ${body?.jobs?.length ?? 0} jobs`);
  } catch (e) {
    console.warn(`[cron] "${cron}": ${e instanceof Error ? e.message : e}`);
  }
}

for (;;) {
  const now = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 60_000 - (now % 60_000) + 50));
  const minute = new Date();
  for (const schedule of schedules) if (isDue(schedule, minute)) void fire(schedule.text);
}
