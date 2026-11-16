// A `metrics-<dataset>` service: prints each Analytics Engine data point as one JSON line on workerd's standard
// output, where `docker compose logs` or a log shipper collects it. Only a self-host generated with `--metrics` binds
// METRICS to it; without it METRICS is unbound, which both services allow.
import { dataPointOf } from './event.ts';

export default {
  async fetch(request: Request, env: { DATASET: string }): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    try {
      const point = dataPointOf((await request.json()) as Record<string, unknown>);
      console.log(`[metrics] ${JSON.stringify({ dataset: env.DATASET, ...point })}`);
    } catch (e) {
      console.warn('[metrics] unreadable event', e instanceof Error ? e.message : e);
    }
    return new Response(null, { status: 204 });
  },
};
