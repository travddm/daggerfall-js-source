// The Worker's entry points that are not player routes: the service's clock (`scheduled`, and the cron door where
// there are no cron triggers) and the operator's door. Each door answers only while its secret is set, so on
// Cloudflare, which sets neither, every request goes to the service's routes.
import { cronDoor, isCronDoor } from './cron-triggers.ts';
import { isOperatorDoor, operatorDoor } from './operator-door.ts';

export { scheduled } from './cron-triggers.ts';

type DoorEnv = Parameters<typeof isCronDoor>[1] & Parameters<typeof isOperatorDoor>[1];

/** The answer of the door this request is for, or null for a request the service's routes answer. */
export function localDoor(request: Request, env: DoorEnv): Promise<Response> | null {
  if (isCronDoor(request, env)) return cronDoor(request, env);
  if (isOperatorDoor(request, env)) return operatorDoor(request, env);
  return null;
}
