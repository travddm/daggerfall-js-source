# Operator commands

`selfhost/operator.ts` runs the operator's acts on a self-hosted server. Each command posts one act to the account
service's operator door (`server-account/src/operator-door.ts`, path `/__operator`) and prints the JSON answer.

## Where it runs

- The door answers only while `OPERATOR_SECRET` is set (`node selfhost/keys.ts` writes it to `selfhost/.env`) and only
  a request that carries it in `x-operator-secret`. Unset, the path is an unknown one, as on Cloudflare.
- Caddy answers `/__operator` with 404 on the public accounts name. Run the command on the host: without Docker, with
  `.env` loaded (`set -a && . selfhost/.env && set +a`); with Docker, inside the workerd container
  (`docker compose -f selfhost/docker-compose.yml exec workerd node /dfo/selfhost/operator.ts ...`).
- `--door <url>` or `OPERATOR_DOOR` names another door. The default is `http://127.0.0.1:8788/__operator`.

## Commands

| Command                                                                                | What it does                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `find <handle>`                                                                        | The account's id, its registration time and its staff role.                                                                                                                                                                                                                                                                                                  |
| `role <account id> owner\|admin\|moderator\|none`                                      | Sets the account's staff role. It takes the id, not the handle: check the registration time with `find` first ([Staff roles](staff-roles.md)).                                                                                                                                                                                                               |
| `recovery <handle>`                                                                    | Stores the hash of a new recovery code on the account and prints the code once. Give the code to the player privately, after you verify the account's owner. The player uses it in "Forgot password", picks a new password and gets new codes, and every device is signed out.                                                                               |
| `post --to <handle,handle> --batch <name> --subject <text> --message <text> [--apply]` | A server post from "The Developers" to each named account (up to 200). Without `--apply` it lists the accounts found, the unknown names and who already holds that batch, and writes nothing. A batch reaches each account once. `\n` in the message is a line break.                                                                                        |
| `characters --by <admin handle> <handle>`                                              | The account's realm characters and their ids, read as the named Admin.                                                                                                                                                                                                                                                                                       |
| `rollback --by <admin handle> <character id> [--note <text>] [--apply]`                | The review's rollback (`server-account/src/review.js`): the realm character goes back to its last clean save. Without `--apply` it prints the character's findings and writes nothing. The named account must hold the Admin role, and the rollback is written into the character's findings under that name. A client playing the character loses its seat. |

A refused act answers `{ "ok": false, "error": "<reason>" }` and the command exits with status 1.
