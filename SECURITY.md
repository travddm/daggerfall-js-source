# Reporting security issues

Please report a security problem in this repository's code privately, not in public. A vulnerability posted publicly
can be abused before it is fixed.

## How to report

Open the repository's [Security tab](https://github.com/travddm/daggerfall-js-source/security) and choose **Report a
vulnerability**. That creates a private advisory that only you and the maintainers can see. If the button is not there,
private reporting is not switched on for the repository yet: do not post the details in a public issue or pull request.

## What to include

- What happens, and what you expected to happen.
- The steps that make it happen again, as exactly as you can.
- Where it happens: the file, route or service involved.
- What it gives an attacker: for example, access to another user's data, or a secret exposed in the code or a build.

## Scope

The code in this repository: the game client and the desktop app (`app/`), and the account service and relay server
code (`server-account/`, `server/`, `selfhost/`). Servers are self-hosted from `selfhost/`; this project runs no
official live service. Problems in third-party services (GitHub, Cloudflare) go to those services. Daggerfall's own game
data is not part of this project.

Ordinary bugs that nothing could abuse are welcome as well, but through the same private channel until the repository
takes public bug reports.

## Acting in good faith

Test a finding only as far as you need to confirm it, on your own machine or your own server, and do not read, change
or delete anyone else's data. Give the maintainers reasonable time to fix the problem before you talk about it publicly.
This is a free project and has no paid bug bounty.
