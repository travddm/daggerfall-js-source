// Console errors and page errors that a probe run tolerates. An entry needs a reason that names the cause, and is
// removed when the cause is fixed. Shape: { match: RegExp, reason: string }. The match runs on the harness's line:
// `[console] <text> <url>`, `[http <status>] <url>`, `[pageerror] <message>` or `[requestfailed] <url> <error>`.
export const ALLOWED_ERRORS = Object.freeze([
  {
    match: /\/arena2\/BOK\d+\.TXT/,
    reason:
      'The freeware ARENA2 (tools/fetch-data.sh) has no BOK*.TXT book files; the game asks for each of its 184 books ' +
      'when it boots and answers a 404 with an empty shelf. Each 404 is a console error. Open finding: the game should ' +
      'not request files it can know are absent, or should say so once.',
  },
  {
    match: /(\[http 403\]|Forbidden\)) http:\/\/127\.0\.0\.1:\d+\/v1\//,
    reason:
      "A guest account may not use the account service's professions, market, homes or hunt: it answers 403, and the " +
      'online client asks anyway on every page load. Each 403 is a console error. Open finding: the client should not ' +
      'ask as a guest.',
  },
]);
