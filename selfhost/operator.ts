// The operator's commands for a self-hosted server: each posts one act to the account service's operator door
// (server-account/src/operator-door.ts) and prints its answer. Run it on the machine that hosts the service, with
// OPERATOR_SECRET from selfhost/.env in the environment. In Docker, run it inside the workerd container, where the door
// is reached at 127.0.0.1; Caddy does not pass the door to the public name.
//
//   node selfhost/operator.ts find <handle>
//   node selfhost/operator.ts role <account id> owner|admin|moderator|none
//   node selfhost/operator.ts recovery <handle>
//   node selfhost/operator.ts post --to <handle,handle> --batch <name> --subject <text> --message <text> [--apply]
//   node selfhost/operator.ts characters --by <admin handle> <handle>
//   node selfhost/operator.ts rollback --by <admin handle> <realm character id> [--note <text>] [--apply]
//
// Options: --door <url> (default $OPERATOR_DOOR, else http://127.0.0.1:8788/__operator).
import { parseArgs } from 'node:util';

export const USAGE = [
  'usage: node selfhost/operator.ts find <handle>',
  '       node selfhost/operator.ts role <account id> owner|admin|moderator|none',
  '       node selfhost/operator.ts recovery <handle>',
  '       node selfhost/operator.ts post --to <handle,handle> --batch <name> --subject <text> --message <text> [--apply]',
  '       node selfhost/operator.ts characters --by <admin handle> <handle>',
  '       node selfhost/operator.ts rollback --by <admin handle> <realm character id> [--note <text>] [--apply]',
  '  OPERATOR_SECRET from selfhost/.env; --door <url> for a door other than http://127.0.0.1:8788/__operator',
].join('\n');

export const DEFAULT_DOOR = 'http://127.0.0.1:8788/__operator';

type Request = { door: string; body: Record<string, unknown> };

/** The door and the body one command line asks for, or null for a line that is no command. */
export function requestOf(argv: string[], env: Record<string, string | undefined> = {}): Request | null {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      door: { type: 'string' },
      to: { type: 'string' },
      batch: { type: 'string' },
      subject: { type: 'string' },
      message: { type: 'string' },
      by: { type: 'string' },
      note: { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
  });
  const door = values.door ?? env.OPERATOR_DOOR ?? DEFAULT_DOOR;
  const [act, first, second] = positionals;
  const ask = (body: Record<string, unknown>): Request => ({ door, body: { act, ...body } });
  if (act === 'find' && first && positionals.length === 2) return ask({ handle: first });
  if (act === 'recovery' && first && positionals.length === 2) return ask({ handle: first });
  if (act === 'role' && first && second && positionals.length === 3) return ask({ id: first, role: second });
  if (act === 'post' && positionals.length === 1 && values.to && values.batch && values.subject && values.message)
    return ask({
      handles: values.to,
      batch: values.batch,
      subject: values.subject,
      message: values.message,
      apply: values.apply,
    });
  if (act === 'characters' && first && values.by && positionals.length === 2)
    return ask({ by: values.by, handle: first });
  if (act === 'rollback' && first && values.by && positionals.length === 2)
    return ask({ by: values.by, id: first, note: values.note, apply: values.apply });
  return null;
}

async function main(): Promise<void> {
  const secret = process.env.OPERATOR_SECRET;
  if (!secret) throw new Error('OPERATOR_SECRET is unset: run node selfhost/keys.ts and pass the .env file');
  const request = requestOf(process.argv.slice(2), process.env);
  if (!request) throw new Error(USAGE);
  const res = await fetch(request.door, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-operator-secret': secret },
    body: JSON.stringify(request.body),
  });
  const text = await res.text();
  console.log(text);
  if (!res.ok) process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
