#!/bin/sh
# workerd opens each disk service's directory as it starts. The volume at /data is mounted after the image is built,
# so the directories are made here.
set -eu
for dir in relay-objects accounts-objects d1-objects r2-objects r2-files; do mkdir -p "/data/$dir"; done
exec /dfo/selfhost/node_modules/.bin/workerd serve /dfo/selfhost/build/dfo.capnp --experimental
