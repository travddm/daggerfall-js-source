#!/bin/bash
# Refreshes the read-only caches the runner containers mount: ARENA2 (freeware Daggerfall data) and an npm cache
# warmed from a checkout's package-lock.json. Run as dfo-ci from cron or a systemd timer, weekly and after a lockfile
# change. Usage: refresh-caches.sh <path of a checkout of the repository> [image]
set -euo pipefail

checkout="$(realpath "${1:?checkout path}")"
image="${2:-dfo-ci-runner:current}"
cache="${CACHE_DIR:-/srv/dfo-ci/cache}"

rm -rf "$cache/arena2-new" "$cache/npm-new"
mkdir -p "$cache/arena2-new" "$cache/npm-new"
# The container user (uid 10001) must be able to write them; they are mounted read-only afterwards.
chmod 0777 "$cache/arena2-new" "$cache/npm-new"
docker run --rm --label dfo-ci=1 --user 10001:10001 --entrypoint bash \
  -v "$checkout:/src:ro" -v "$cache/arena2-new:/out/arena2" -v "$cache/npm-new:/out/npm" "$image" -c '
    set -euo pipefail
    work=$(mktemp -d)
    sh /src/tools/fetch-data.sh "$work"
    cp -a "$work/arena2/." /out/arena2/
    mkdir "$work/repo" && cp -a /src/. "$work/repo/"
    cd "$work/repo" && npm ci --ignore-scripts --cache /out/npm
    chmod -R a+rwX /out   # so the host user can replace and delete them
  '

rm -rf "$cache/arena2.old" "$cache/npm.old"
[ -d "$cache/arena2" ] && mv "$cache/arena2" "$cache/arena2.old"
[ -d "$cache/npm" ] && mv "$cache/npm" "$cache/npm.old"
mv "$cache/arena2-new" "$cache/arena2"
mv "$cache/npm-new" "$cache/npm"
rm -rf "$cache/arena2.old" "$cache/npm.old"
echo "caches refreshed under $cache"
