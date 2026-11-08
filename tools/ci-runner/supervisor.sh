#!/bin/bash
# One slot of the self-hosted CI runner: mint a just-in-time configuration, run one job in a fresh container, repeat.
# Usage: supervisor.sh <slot>   (started by dfo-runner@<slot>.service; settings in /etc/dfo-runner/runner.env)
set -euo pipefail

slot="${1:?slot number}"
: "${ORG:?}" "${RUNNER_GROUP_ID:?}" "${TOKEN_FILE:?}" "${IMAGE:?}" "${FIRST_CPU:?}" "${CPUS_PER_RUNNER:?}"
: "${MEMORY:?}" "${SHM_SIZE:?}" "${CACHE_DIR:?}" "${NETWORK:?}"

first=$((FIRST_CPU + slot * CPUS_PER_RUNNER))
cpuset="${first}-$((first + CPUS_PER_RUNNER - 1))"
api=https://api.github.com
runner_id=""
container=""

api_call() {
  curl -fsS -H "Authorization: Bearer $(cat "$TOKEN_FILE")" -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" "$@"
}

# A just-in-time runner that never took its job stays listed until deleted; a used one removes itself.
cleanup() {
  [ -n "$container" ] && docker rm -f "$container" >/dev/null 2>&1 || true
  [ -n "$runner_id" ] && api_call -X DELETE "$api/orgs/$ORG/actions/runners/$runner_id" >/dev/null 2>&1 || true
}
trap 'cleanup; exit 0' TERM INT

while true; do
  name="dfo-$(hostname -s)-s${slot}-$(date +%s)"
  body=$(jq -n --arg n "$name" --argjson g "$RUNNER_GROUP_ID" \
    '{name: $n, runner_group_id: $g, labels: ["self-hosted", "linux", "x64", "dfo-self-hosted"], work_folder: "_work"}')
  if ! reply=$(api_call -X POST "$api/orgs/$ORG/actions/runners/generate-jitconfig" -d "$body"); then
    echo "could not mint a runner configuration; retrying in 30 s" >&2
    sleep 30
    continue
  fi
  runner_id=$(jq -r '.runner.id' <<<"$reply")
  jit=$(jq -r '.encoded_jit_config' <<<"$reply")
  container="$name"

  # No Docker socket, no capabilities, no privilege escalation, a CPU set, a hard memory cap with no swap, a process cap.
  # The work folder lives in the container's own layer (disk, not RAM), which --rm deletes with the container.
  # Chromium runs with Playwright's default --no-sandbox, so the default seccomp profile is kept.
  docker run --rm --name "$container" --label dfo-ci=1 \
    --network "$NETWORK" \
    --cgroup-parent dfo-ci.slice \
    --cpuset-cpus "$cpuset" --memory "$MEMORY" --memory-swap "$MEMORY" --pids-limit 4096 --shm-size "$SHM_SIZE" \
    --cap-drop ALL --security-opt no-new-privileges \
    -v "$CACHE_DIR/arena2:/opt/dfo-cache/arena2:ro" -v "$CACHE_DIR/npm:/opt/dfo-cache/npm:ro" \
    -e DFO_JITCONFIG="$jit" "$IMAGE" || echo "runner container exited non-zero; starting the next one" >&2

  container=""
  runner_id=""
  sleep 2
done
