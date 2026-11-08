# Self-hosted CI runner

CI for the private repository runs on the owner's OVHCloud server, not on GitHub-hosted runners. A private repository
gets only 2,000 free Actions minutes a month, and one pull request's `verify` (8 test shards), `probes` (8 probes) and
`standards` jobs use that in days. This page covers the design, the server setup, security, capacity, updates, a test
on a throwaway repository, and the rollback. The files are in `tools/ci-runner/`.

## How the workflows choose a runner

Every job in `.github/workflows/` (except the desktop release's build matrix) has:

```yaml
runs-on: ${{ github.event.repository.private && vars.DFO_CI != 'hosted' && 'dfo-self-hosted' || 'ubuntu-latest' }}
```

- A public repository evaluates to `ubuntu-latest`, so nothing changes while the repository is public.
- A private repository evaluates to the label `dfo-self-hosted`. Setting the repository variable `DFO_CI` to `hosted`
  sends every job back to GitHub-hosted runners (Rollback).
- A missing `repository.private` evaluates to `ubuntu-latest`. The expression fails toward GitHub-hosted, never toward
  the server.
- The workflows run on `push`, `pull_request`, `pull_request_target`, `workflow_dispatch` and `workflow_call`. The first
  four deliver a webhook payload with a `repository` object. In a called workflow (`verify.yml`, `test-times.yml`) the
  `github` context belongs to the caller, so it reads the caller's payload. GitHub's docs say that the `github` context
  is available in `jobs.<job_id>.runs-on` and that `vars` is too ([contexts]). Test the expression on the throwaway
  repository first (Test before the move): that run is the proof for the called workflows.
- The Windows and macOS legs of `release-desktop.yml` cannot run on a Linux server and stay GitHub-hosted. That job's
  `version` and `publish` jobs use the expression; its `build` matrix keeps `runs-on: ${{ matrix.os }}`. In a private
  repository on the free plan, the included usage is $12 a month, which buys about 2,000 Linux minutes, 1,200 Windows
  minutes or 190 macOS minutes ([billing]). One desktop release can use a large part of it. Check the billing page before
  the first private release.
- Steps that assume GitHub-hosted tools carry `if: runner.environment == 'github-hosted'` or `'self-hosted'`
  (`probes.yml`: Chromium with system libraries, and ARENA2). A GitHub-hosted run executes the same steps as before.

## GitHub Pages while private

GitHub Pages needs a paid plan for a private repository ([pages]), so the `site` and `deploy` jobs of `deploy.yml` carry
`if: ${{ !github.event.repository.private }}`. A private repository publishes no site. The Cloudflare deploys
(`relay-deploy.yml`, `account-deploy.yml`) are separate workflows and still run. The two jobs run again once the
repository is public, with no other change.

To view the site locally, build what the `site` job publishes and serve it:

```bash
npm ci
npm run pages:build              # tools/fetch-vendor.sh, then the production build, into scratch/pages-site
npm run pages:preview            # http://localhost:4173/
npm run pages:build -- --atlas   # also builds the chatgpt/exact-face-atlas preview and mounts it, as the workflow does
```

The build needs network for the vendored files. `tools/pagesSite.mjs` limits open files on Windows, where Vite's build
otherwise fails with "too many open files". Keep the script in step with the `site` job.

## Architecture

```text
GitHub (org Daggerfall-JS, runner group "dfo-private": private repositories only)
        ^ HTTPS 443 outbound only
        |
OVH server ── systemd: dfo-runner@0 … dfo-runner@N-1.service   (user dfo-ci, no root)
                  each: loop { mint a just-in-time runner config; docker run --rm <image>; }
              ── Docker (the same daemon as Wings), network "dfo-ci" (172.29.0.0/24, firewalled)
              ── systemd slice dfo-ci.slice: one memory, CPU-weight and task cap for all runners together
              ── /srv/dfo-ci/cache/{arena2,npm}: read-only mounts, refreshed by timer, outside any job
```

- One slot is one systemd service. A slot runs one container at a time, and that container runs one job.
- A just-in-time runner takes one job and GitHub removes it ([ephemeral]). The container is removed too (`--rm`), with
  its work folder, npm cache copy and Chromium profile. The next job starts from the image.
- The runner group is private-only. GitHub states that by default only private repositories can use a group, and warns
  against public repositories because a fork's pull request could run code on the runner ([access]).

## Why beside Pterodactyl, not under it

Recommendation: plain Docker beside Pterodactyl, supervised by systemd. Do not make an egg.

- An egg is a game server: the panel starts one container, applies its limits, and keeps it running. A CI runner needs a
  new container for each job, which Wings does not do. One long-lived runner container would carry state from job to
  job and break the one-fresh-environment-per-job rule, unless the panel restarted it after each job.
- Wings gives each server container a process cap, `container_pid_limit`, default 512 ([wings-config]). A Chromium probe
  plus a Vite server plus workerd can reach that, and raising it for one server means raising it for the node.
- A job that needs to start containers would need the Docker socket, which is root on the host. The design never mounts
  the socket into a runner. Nothing in the workflows calls `docker`.
- Wings talks to Docker's API; it does not need the daemon to itself. The same daemon can host the runners. Wings'
  containers sit on the `pterodactyl_nw` network ([wings-config]). Runners get their own network and firewall rules, so
  the two groups cannot reach each other.
- Separate cgroup limits stop CI from starving the game servers: `dfo-ci.slice` caps the runners as a group, and
  `--cpuset-cpus` gives each runner its own cores.

If a stronger wall is wanted, run a second Docker daemon for CI (`dockerd --data-root /srv/dfo-ci/docker --host
unix:///run/docker-ci.sock --bridge none` plus its own iptables settings). Disk, images and prune commands are then
separate from Wings'. It costs more to set up and is not needed to start.

Things to know about the shared daemon:

- Never run `docker system prune` or `docker image prune -a` on this box: they delete Wings' unused images and
  stopped containers. The CI scripts only prune with `--filter label=dfo-ci=1`.
- Docker's disk is shared. A full disk stops the game servers. The CI work folder is in the container layer; watch
  `df -h /var/lib/docker` (Capacity).
- Membership of the `docker` group is root on the host. The `dfo-ci` user runs only the supervisor. It does not run
  jobs; jobs run as uid 10001 inside the container with no capabilities. Rootless Docker would remove that exposure but
  runs beside Wings only with its own socket and network settings, so it is not part of this setup.

## Prerequisites

1. Ubuntu 22.04 or 24.04 with Wings working, root or sudo, Docker with the systemd cgroup driver
   (`docker info --format '{{.CgroupDriver}}'` prints `systemd`). `--cgroup-parent dfo-ci.slice` needs it.
2. Outbound HTTPS to `github.com`, `api.github.com`, `*.actions.githubusercontent.com`, `codeload.github.com` and
   `objects.githubusercontent.com` ([runner-comms]), plus npm, `nodejs.org`, Playwright's CDN, Cloudflare for the deploy
   jobs, and the ARENA2 source (`drive.usercontent.google.com`).
3. Free disk: about 30 GB for the image, caches and one job's work folder, and more for more slots.
4. Org owner access on `Daggerfall-JS`.
5. The CI budget: 2 to 4 cores and 4 to 8 GB of RAM (Capacity). 4 cores and 8 GB is the working size.
6. **Open, a step for the owner:** a token that can mint runner configurations (Credential). The owner creates it and
   stores it on the server. It is never pasted into a chat or a ticket.

## Setup

Run on the server as a sudo user. Replace the placeholders.

### 1. User, directories, files

```bash
sudo useradd --system --create-home --home-dir /var/lib/dfo-ci --shell /usr/sbin/nologin dfo-ci
sudo usermod -aG docker dfo-ci
sudo mkdir -p /opt/dfo-runner /etc/dfo-runner /srv/dfo-ci/cache
sudo chown dfo-ci:dfo-ci /srv/dfo-ci/cache
git clone https://github.com/travddm/daggerfall-js-source.git /tmp/dfo-src   # or use a checkout you already have
sudo install -m 0755 /tmp/dfo-src/tools/ci-runner/{supervisor.sh,network.sh,refresh-caches.sh} /opt/dfo-runner/
sudo install -m 0644 /tmp/dfo-src/tools/ci-runner/dfo-runner@.service /etc/systemd/system/
sudo install -m 0644 /tmp/dfo-src/tools/ci-runner/dfo-ci.slice /etc/systemd/system/
sudo install -m 0640 -o root -g dfo-ci /tmp/dfo-src/tools/ci-runner/runner.env.example /etc/dfo-runner/runner.env
```

Do not add `dfo-ci` to any group but `docker`. The clone is the repository after it moves; use its new URL then.

### 2. Runner group (GitHub, org owner)

In the org: Settings, Actions, Runner groups, New runner group. Name it `dfo-private`, set Repository access to
"Selected repositories" (add the private repositories) and leave "Allow public repositories" off ([access]). Find the
id and write it into `RUNNER_GROUP_ID` in `/etc/dfo-runner/runner.env`:

```bash
gh api /orgs/Daggerfall-JS/actions/runner-groups --jq '.runner_groups[] | [.id,.name,.visibility] | @tsv'
```

Also in Settings, Actions, General: set "Fork pull request workflows" to require approval for outside collaborators, and
keep the org's default group empty of runners.

### 3. Credential

The supervisor calls `POST /orgs/{org}/actions/runners/generate-jitconfig` ([jit-api]). GitHub's page requires admin
access to the org, and the `admin:org` scope for a classic personal access token. Recommended: a classic token from a
dedicated GitHub account that is an org owner and owns nothing else, so the token's reach is the org's runners and
settings. Try a fine-grained token with the organization permission "Self-hosted runners: write" first, if the endpoint
accepts it (the REST page does not say; the throwaway test shows it).

**The owner does this step, on the server.** Create the token in GitHub (the dedicated account's Settings, Developer
settings, Personal access tokens), and copy it straight into the prompt below. Do not paste it into a chat, an issue, a
workflow or a GitHub secret. A GitHub secret reaches workflows, not the server, and a workflow that held the token could
mint runners. The prompt does not echo the token or put it in the shell history:

```bash
sudo bash -c 'umask 077; read -rsp "Token: " t; printf %s "$t" > /etc/dfo-runner/token; echo; chown dfo-ci:dfo-ci /etc/dfo-runner/token; chmod 0400 /etc/dfo-runner/token'
```

Check it without printing it; the command prints `200`:

```bash
sudo -u dfo-ci bash -c 'curl -fsS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $(cat /etc/dfo-runner/token)" https://api.github.com/orgs/Daggerfall-JS'
```

To replace the token, run the prompt again. The supervisor reads the file on every job.

Just-in-time configurations are single-use and leave no idle registered runner. A registration token with
`config.sh --ephemeral` also works but keeps a registered, idle runner on the box between jobs.

### 4. Build the image

Pick the runner release and read the Playwright version from the lockfile:

```bash
RUNNER_VERSION=$(gh api repos/actions/runner/releases/latest --jq '.tag_name' | tr -d v)
PW=$(node -p "require('/tmp/dfo-src/package-lock.json').packages['node_modules/playwright'].version")
sudo docker build -t dfo-ci-runner:$(date +%Y%m%d) -t dfo-ci-runner:current \
  --build-arg RUNNER_VERSION=$RUNNER_VERSION --build-arg PLAYWRIGHT_VERSION=$PW /tmp/dfo-src/tools/ci-runner
```

Tools the image carries (what the workflows call and GitHub-hosted runners provide): git, curl, jq, unzip, zip, gh,
`grep -P` (GNU grep), a C toolchain and python3 for native npm modules, Node (`setup-node@v4` selects node 22 per run),
Chromium with its system libraries at `/opt/pw-browsers`, and the runner application. `wrangler` is not installed:
the jobs run `npx wrangler@4`. The job user has no sudo, so any other `apt` step in a workflow fails. Add the package
to the Dockerfile.

### 5. Network, slice, caches

```bash
sudo systemctl daemon-reload
sudo NETWORK=dfo-ci /opt/dfo-runner/network.sh
sudo -u dfo-ci /opt/dfo-runner/refresh-caches.sh /tmp/dfo-src
```

`network.sh` creates the `dfo-ci` network and drops runner traffic to private ranges, the provider's network, the
metadata address and the host itself. Check that `172.29.0.0/24` is free (`docker network ls`, `ip route`). If
it is not, edit `subnet=` in the script. Check Wings' network is untouched (`docker network inspect pterodactyl_nw`).

Edit `/etc/systemd/system/dfo-ci.slice` (Capacity), then `sudo systemctl daemon-reload`.

### 6. Start the slots

Edit `/etc/dfo-runner/runner.env`: `RUNNER_GROUP_ID`, `FIRST_CPU` (the first core the CI may use), `CPUS_PER_RUNNER`.
Slot N gets cores `FIRST_CPU + N*CPUS_PER_RUNNER` upward, so `lscpu -e` decides the numbers; give each slot sibling
hardware threads together. Then:

```bash
sudo systemctl enable --now dfo-runner@0.service           # one slot; more in Capacity
journalctl -u dfo-runner@0 -f                               # "Listening for Jobs"
```

Weekly timers for step 4 (rebuild the image, so the runner never has to self-update inside a job) and step 5's
`refresh-caches.sh` (ARENA2, npm cache) belong in cron or systemd timers. A slot uses the `current` tag each
time it starts a container, so a rebuilt image needs no restart; a running job finishes on the old one.

### 7. Check the limits

```bash
docker run --rm --cpuset-cpus 8-11 --memory 8g --entrypoint node dfo-ci-runner:current -p 'os.availableParallelism()'
```

`tools/testShards.mjs` runs every test file with `--test-concurrency=availableParallelism()`. The pin to four cores
must print `4`; if it prints the host's core count, the shards would start too many workers on four cores. Pinning with
`--cpuset-cpus` changes the affinity Node reads. Docker's `--cpus` is a time quota and does not change it
([resources]), so the supervisor does not use it.

## Caches

| Cache                       | Where                                         | How it is used                              |
| --------------------------- | --------------------------------------------- | ------------------------------------------- |
| ARENA2 (freeware game data) | `/srv/dfo-ci/cache/arena2`, mounted read-only | `probes.yml` links it into `$RUNNER_TEMP`   |
| npm cache                   | `/srv/dfo-ci/cache/npm`, mounted read-only    | the entrypoint copies it into the container |
| Playwright Chromium         | baked in the image at `/opt/pw-browsers`      | `playwright install chromium` finds it      |
| `node_modules`, test times  | GitHub's cache service (`actions/cache`)      | unchanged, works from a self-hosted runner  |

Writable shared caches would let one job poison the next, so the host mounts are read-only and refreshed outside any
job. A job's own cache writes go to its container and die with it.

## Security

- Org-level runner group, private repositories only. A public repository, or a fork, cannot be given the label. GitHub's
  hardening guide says self-hosted runners should almost never be used for public repositories ([hardening]).
- A repository collaborator with write access can run any code on a runner by editing a workflow in a pull request.
  Treat write access to the private repositories as access to the container (not the host). Keep fork pull request
  approval on.
- The container has no Docker socket, no capabilities (`--cap-drop ALL`), `no-new-privileges`, a process cap, a memory
  cap without swap, its own cores and a firewalled network. It can reach the internet and the repository's own
  services, not the host or Wings.
- GitHub warns that re-using hardware for JIT runners can expose information from the environment ([hardening]). The
  mitigations here: one container per job, no shared writable volume, and the host files mounted read-only. The
  kernel is shared. A container escape reaches the game servers. Keep the host patched.
- The single-use JIT configuration is passed in the container's environment and removed from it before the job starts;
  it remains in the runner's command line for that job. It is valid only for that runner.
- Repository secrets (the private-repository setup). The deploy workflows read `secrets.CLOUDFLARE_API_TOKEN` (and the
  Patreon, Discord and Anthropic keys in `account-deploy.yml`) as repository secrets. The organization is on the Free
  plan, which cannot configure environments for private repositories ([environments]), so while the repository is
  private these stay repository-wide secrets. Anyone who can push a branch to the repository can write a workflow that
  reads them. That is accepted for now: keep write access to the owner and trusted collaborators, and keep the
  Cloudflare token's scope to what the deploys need. A job runs in a fresh container, so a secret does not outlive it.
- Going public again: first move every deploy secret into an environment (for example `production`) with deployment
  branches limited to `main`, point the deploy jobs at it with `environment:`, and delete the repository-wide copies.
  Then make the repository public. A public repository gets GitHub-hosted runners from the expression, and the private
  runner group does not accept it.
- Rotate the runner token on a schedule, and when a collaborator leaves.

## Capacity

### What a job needs

Measured on 2026-11-03 on GitHub-hosted `ubuntu-latest` (4 vCPUs and 16 GB for a public repository, [hosted]) with
`tools/ci-runner/measure-job.sh`, each job pinned to 4 and to 2 cores with `taskset`. "RAM" is the most the job added to
the machine's used memory; add about 0.5 GB for the runner application and the container.

| Job                        | RAM at peak | 4 cores    | 2 cores         | Notes                                                                |
| -------------------------- | ----------- | ---------- | --------------- | -------------------------------------------------------------------- |
| Test shard (1 of 8)        | 0.7–2.0 GB  | 242–248 s  | 488 s           | Uses every core given: 2 cores take 2x as long                       |
| Lint and types             | 1.9 GB      | 119 s      | no clean figure | One busy core for most of the run; ESLint's cache skews a second run |
| Site build                 | 5.0 GB      | 21 s       | 29 s            | Node's heap cap needs raising in a container (Dockerfile)            |
| Probe build (one of two)   | 4.8 GB      | 16 s       | 18 s            | Both builds at once: 9.1 GB                                          |
| Probe `boot`               | 0.7 GB      | 10 s       | 11 s            | Pre-built game, software GL                                          |
| Probe `dungeon` and `save` | 2.3 GB      | 21 s, 36 s | 28 s, 50 s      |                                                                      |
| Probe `online`             | 6.0 GB      | 59 s       | 94 s            | Two clients, the relay and the account service in workerd            |

Peak tasks (processes and threads) were 20 to 200, far under the `--pids-limit 4096` the supervisor sets. These jobs are
CPU-bound, so a CPU slower than GitHub's makes them longer in proportion. In the first week on the box, measure again
(Measuring a job).

**Is 4 to 8 GB enough?** For one job at a time, yes, with two changes already made in this repository: the image sets
Node's heap cap (`--max-old-space-size=4096`), and on a self-hosted runner `probes.yml` builds the two game builds one
after the other (9.1 GB at once, 5 GB one at a time). The most any job needs is 6.0 GB (`online`) plus 0.5 GB, so
**7 GB is the minimum for every job, and 8 GB is the budget.** At 4 GB the shards, lint and types, and the probes
`boot`, `dungeon`, `save`, `pause`, `town`, `travel` and `rest` fit. The builds (5 GB) and `online` (6 GB) do not.

### Slots and time per pull request

One slot runs one job at a time. Under 4 cores and 8 GB there is one slot: two jobs at once would get 2 cores and 4 GB
each, and the builds and `online` need more. A pull request starts about 20 jobs. Their durations on GitHub's runners,
set-up included, averaged over ten recent green runs: 8 shards of 4.3–5.3 min (38.8 min together), lint and types
2.8 min, `standards` 2.9 min, the site build 0.8 min, the probes build 1.3 min, 8 probes of 1.2–2.3 min (14 min
together), and about 0.5 min of small jobs. Together that is 61 min of one 4-core slot. Estimates for a pull request run
that a newer push does not cancel:

| CI budget         | Slots | Time for one pull request                  | Notes                                                 |
| ----------------- | ----- | ------------------------------------------ | ----------------------------------------------------- |
| 2 cores, 4 GB     | 1     | not enough RAM for the builds and `online` |                                                       |
| 2 cores, 8 GB     | 1     | about 105 min                              | Shards take 2x as long                                |
| **4 cores, 8 GB** | **1** | **about 60 min**                           | The budget. Set `DFO_PROBE_SKIP` only if RAM is short |
| 8 cores, 16 GB    | 2     | about 30 min                               | Two jobs at once, 4 cores and 8 GB each               |
| 12 cores, 24 GB   | 3     | about 21 min                               |                                                       |

The figures assume the box's cores match GitHub's. Jobs queue when every slot is busy, and they fail after 24 hours in
the queue ([runner-comms]). A newer push to a pull request cancels its running and queued jobs (`concurrency` in
`check.yml`, `probes.yml` and `ste-notes.yml`), so a stack of pushes does not stack up work on the box.

### What the workflows do for a small box

- Fewer, larger shards do not help. A shard job runs 242–248 s of tests inside a job of about 290 s, so set-up is
  about 15 percent, and fewer jobs would save only that. The shard count stays 8 (`flow1_ci.test.js` pins it).
- The probes `build` job builds the two game builds one after the other on a self-hosted runner
  (`RUNNER_ENVIRONMENT`), at a cost of about 16 s.
- The repository variable `DFO_PROBE_SKIP` (for example `online`) leaves the named probes out of a plain `probes` run.
  Use it only if the box cannot spare 7 GB. A manual run of one probe ignores it.
- The path filter on `probes.yml` stays: the probes start only for changes to the game, the relay, the account service
  and the probe tools.

### Should the owner give it more?

4 cores and 8 GB is enough to run every job, one at a time, in about an hour per pull request. Adding 4 cores and 8 GB
(8 cores, 16 GB, two slots) halves that to about 30 minutes and lets the checks of two pull requests overlap. That is the
first step worth buying. Past three slots the gain is small, because the longest job (a shard on 4 cores, about 5
minutes) sets the floor. Fewer than 4 cores per slot makes the shards slower in proportion, so prefer one 4-core slot to
two 2-core slots.

In the first week, check real use on the box:

```bash
systemd-cgtop -m -n 1 | grep -i dfo         # memory by slice/container while jobs run
cat /sys/fs/cgroup/dfo-ci.slice/memory.peak # peak since the slice started
```

Set `MemoryMax` in `dfo-ci.slice` to slots x 8 GB, and `FIRST_CPU` above the cores Wings keeps.

### Measuring a job

`tools/ci-runner/measure-job.sh <label> <cpu-list> <command...>` runs a command pinned to those cores and prints one
table row: wall seconds, peak RAM added in MB, CPU busy percent, peak tasks added, exit status. The table above came
from it, run on a GitHub-hosted runner by a temporary workflow. On the box:

```bash
cd /tmp/dfo-src && npm ci
bash tools/ci-runner/measure-job.sh shard-1of8 8-11 node tools/testShards.mjs 1/8
```

Run it on a quiet box, and compare the row with the table.

### Adding capacity

1. Raise `MemoryMax` in `dfo-ci.slice`; `systemctl daemon-reload`.
2. Set `FIRST_CPU` and `CPUS_PER_RUNNER` so that slot N's cores do not overlap Wings' cores or another slot's, then
   `sudo systemctl enable --now dfo-runner@1.service` (the next number).
3. A second server: repeat Setup there with the same group. Names carry the hostname.

Watch disk: `df -h /var/lib/docker` and `docker ps -a --filter label=dfo-ci=1`. A weekly
`docker container prune -f --filter label=dfo-ci=1` and `docker image prune -f --filter label=dfo-ci=1` removes leftovers.

## Updating

- Image (runner application, tools, Chromium): rebuild step 4 weekly and when `package-lock.json` moves Playwright.
  GitHub updates runners automatically and stops queuing jobs to one that is over 30 days behind if updates are off
  ([runner-comms]). A stale image only costs a self-update inside the job.
- Workflow tool change (a new `apt` package): add it to the Dockerfile, rebuild, and the next container has it.
- Token: replace `/etc/dfo-runner/token`; no restart.
- Supervisor, network or unit files: `git pull` in `/tmp/dfo-src`, re-run the `install` lines, `daemon-reload`, restart.

## Test before the move

Use a throwaway private repository in the org, with no secrets.

1. Create `Daggerfall-JS/runner-test` (private). Add it to the `dfo-private` group.
2. Push this branch's `.github/workflows/verify.yml`, `check.yml` and `probes.yml`, the repo's `tools/` and
   `package*.json`. A minimal alternative is one workflow that copies the `runs-on` line and prints
   `runner.environment`, `github.event.repository.private`, `nproc` and `node -p 'os.availableParallelism()'`.
3. Open a pull request. Check that jobs start on a slot (`journalctl -u dfo-runner@0`), the shards and probes pass, and
   that Chromium needs no download.
4. Check it from the other side: make a public repository in the org and push a workflow with the same label. The
   job must stay queued with no runner ("Waiting for a runner"), because the group is private-only.
5. Stop one slot mid-job (`systemctl stop dfo-runner@0`) and confirm the runner disappears from the org's runner list.
6. Delete the test repositories.

## Rollback to GitHub-hosted

- Fast: set the repository variable `DFO_CI` to `hosted` (Settings, Secrets and variables, Actions, Variables). New
  jobs use `ubuntu-latest` at once; queued jobs for `dfo-self-hosted` need cancelling and re-running.
- This uses the 2,000 free minutes of a private repository, and a private `ubuntu-latest` has half the cores of a public
  one.
- Slow: stop the slots (`sudo systemctl disable --now dfo-runner@0`, and any other slot), and remove the runner group.
- Removing the expression from the workflows is not needed: with the variable set, or the repository public, it picks
  `ubuntu-latest`.

[contexts]: https://docs.github.com/en/actions/reference/workflows-and-actions/contexts
[billing]: https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions
[ephemeral]: https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/autoscaling-with-self-hosted-runners
[access]: https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access
[hardening]: https://docs.github.com/en/actions/reference/security/secure-use
[jit-api]: https://docs.github.com/en/rest/actions/self-hosted-runners
[runner-comms]: https://docs.github.com/en/actions/reference/runners/self-hosted-runners
[hosted]: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
[environments]: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
[pages]: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
[resources]: https://docs.docker.com/engine/containers/resource_constraints/
[wings-config]: https://docs.pterodactyl.io/docs/wings/configuration
