#!/bin/bash
# Creates the runners' own Docker network and the firewall rules that keep it away from the box.
# Idempotent; runs as root before every supervisor start (ExecStartPre=+).
set -euo pipefail

net="${NETWORK:-dfo-ci}"
subnet=172.29.0.0/24
bridge=br-dfoci

docker network inspect "$net" >/dev/null 2>&1 || docker network create \
  --driver bridge --subnet "$subnet" -o com.docker.network.bridge.name="$bridge" \
  -o com.docker.network.bridge.enable_icc=false "$net"

# Runner containers may reach the internet. They may not reach Pterodactyl's network, the host's other interfaces
# and services, the provider's private network or the metadata address. DOCKER-USER is Docker's hook for this:
# its rules run before Docker's own and survive Docker restarts.
rule() { iptables -C "$@" 2>/dev/null || iptables -I "$@"; }
for dest in 172.16.0.0/12 10.0.0.0/8 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10; do
  rule DOCKER-USER -i "$bridge" ! -o "$bridge" -d "$dest" -j DROP
done
# Traffic from the runners to the host itself (Wings' API, the panel, SSH). Replies to the host's own traffic stay open.
rule INPUT -i "$bridge" -m conntrack ! --ctstate ESTABLISHED,RELATED -j DROP
