#!/bin/bash
# Starts one just-in-time runner. The supervisor passes the single-use configuration in $DFO_JITCONFIG.
set -euo pipefail

# The host's npm cache is mounted read-only; the job gets its own writable copy, which dies with the container.
if [ -d /opt/dfo-cache/npm ]; then
  mkdir -p "$HOME/.npm"
  cp -a /opt/dfo-cache/npm/. "$HOME/.npm/"
fi

jitconfig="$DFO_JITCONFIG"
unset DFO_JITCONFIG
exec ./run.sh --jitconfig "$jitconfig"
