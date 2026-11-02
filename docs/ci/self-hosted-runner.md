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
3. Free disk: about 40 GB for the image, caches and four jobs' work folders. More for more slots.
4. Org owner access on `Daggerfall-JS`, and the numbers: how many cores and how much RAM the CI may use (Capacity).
5. A token that can mint runner configurations (Credential).

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
accepts it (the REST page does not say; the throwaway test shows it). Store it:

```bash
sudo install -m 0400 -o dfo-ci -g dfo-ci /dev/stdin /etc/dfo-runner/token    # paste the token, then Ctrl-D
```

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
sudo systemctl enable --now dfo-runner@{0..3}.service      # four slots
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
- Deploy secrets. The deploy workflows read `secrets.CLOUDFLARE_API_TOKEN` (and Patreon, Discord and Anthropic keys in
  `account-deploy.yml`) as repository secrets, and only `deploy.yml` uses `environment:`. **A Free organization cannot
  configure environments for private repositories** ([environments]), so secrets cannot be scoped to a deploy
  environment there. GitHub Pages in a private repository also needs a paid plan ([pages]). On the Free plan, a pull
  request job from a branch in the same repository can be made to read a repository secret by whoever can push the
  branch. Options: upgrade the org to GitHub Team (environments, required reviewers, branch rules); or keep deploy
  secrets only in a second private repository that has the deploy workflows and few writers; or limit write access to
  the owner. The owner decides; until then, do not run the deploy workflows from a private repository.
- Rotate the runner token on a schedule, and when a collaborator leaves.

## Capacity

Per job, planned, not measured: the test shards and the probes are the heavy jobs. A shard runs every file at
`availableParallelism()`; a probe runs Chromium on SwiftShader (software rendering) with a Vite server, and `online`
adds the relay and account service in workerd. GitHub's public `ubuntu-latest` has 4 vCPUs and 16 GB; a private one has
2 vCPUs and 8 GB ([hosted]). The suite passes on the public size today, so the plan is 4 cores and 8 GB per slot
(`MEMORY=8g`) and the first week measures real use:

```bash
systemd-cgtop -m -n 1 | grep -i dfo        # memory by slice/container while jobs run
cat /sys/fs/cgroup/dfo-ci.slice/memory.peak # peak since the slice started
```

Lower the figures if the peaks stay under half.

The shard records in `tools/testTimes.json` sum to about 64 minutes of file time, 8 minutes a shard before the
runner's parallelism. One pull request starts about 20 jobs: 8 shards, 8 probes, lint and types, the build,
`standards` and `ste`; the last four are light.

Slots that fit: `min( floor(CI cores / 4), floor((CI RAM in GB - 2) / 8) )`. Examples, with the rest left to the games:

| Cores and RAM for CI | Slots | One pull request's heavy jobs (16) take about |
| -------------------- | ----- | --------------------------------------------- |
| 8 cores, 32 GB       | 2     | 16 / 2 x 10 min = 80 min                      |
| 16 cores, 64 GB      | 4     | 40 min                                        |
| 32 cores, 128 GB     | 8     | 20 min                                        |

These times are estimates from a 10-minute job. Jobs queue when all slots are busy, and a job that waits over 24 hours
fails ([runner-comms]). Ask the owner for the box's cores and RAM and the share the games can spare, then set
`MemoryMax` in `dfo-ci.slice` to slots x 8 GB and `FIRST_CPU` above the cores Wings keeps.

### Adding capacity

1. Raise `MemoryMax` in `dfo-ci.slice`; `systemctl daemon-reload`.
2. `sudo systemctl enable --now dfo-runner@4.service` (the next number). Its cores are `FIRST_CPU + 4*CPUS_PER_RUNNER`;
   check they do not overlap Wings' cores.
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
- Slow: stop the slots (`sudo systemctl disable --now dfo-runner@{0..3}`), and remove the runner group.
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
