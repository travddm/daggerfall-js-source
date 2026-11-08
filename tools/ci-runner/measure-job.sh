#!/bin/bash
# Runs one command pinned to some cores and prints how long it took, how much RAM it added at its peak, how busy the
# cores were, and how many tasks (processes and threads) it added at its peak. Used to size the self-hosted runner
# (docs/ci/self-hosted-runner.md, Measuring a job). Linux only; run it on a quiet machine.
#
# Usage: measure-job.sh <label> <cpu-list> <command> [args...]      e.g.  measure-job.sh shard-1 0-3 node tools/testShards.mjs 1/8
# Prints one table row. With GITHUB_STEP_SUMMARY set, the row is appended there too.
set -u

label="$1"
cpus="$2"
shift 2
ncpu=$(taskset -c "$cpus" nproc)

mem_used_mb() { awk '/^MemTotal:/ {t=$2} /^MemAvailable:/ {a=$2} END {printf "%d", (t-a)/1024}' /proc/meminfo; }
tasks_now() { cut -d' ' -f4 /proc/loadavg | cut -d/ -f2; }
cpu_busy_jiffies() { awk '/^cpu / {print $2+$3+$4+$7+$8+$9}' /proc/stat; }

base_mem=$(mem_used_mb)
base_tasks=$(tasks_now)
peak_mem=$base_mem
peak_tasks=$base_tasks
busy_start=$(cpu_busy_jiffies)
start=$(date +%s.%N)

taskset -c "$cpus" "$@" &
job=$!
while kill -0 "$job" 2>/dev/null; do
  m=$(mem_used_mb)
  t=$(tasks_now)
  [ "$m" -gt "$peak_mem" ] && peak_mem=$m
  [ "$t" -gt "$peak_tasks" ] && peak_tasks=$t
  sleep 0.5
done
wait "$job"
status=$?

end=$(date +%s.%N)
busy_end=$(cpu_busy_jiffies)
wall=$(awk -v s="$start" -v e="$end" 'BEGIN {printf "%.0f", e-s}')
busy_pct=$(awk -v b="$busy_start" -v e="$busy_end" -v w="$wall" -v n="$ncpu" 'BEGIN {printf "%.0f", (e-b)/(w*100*n)*100}')
row="| $label | $cpus | $wall | $((peak_mem - base_mem)) | $busy_pct | $((peak_tasks - base_tasks)) | $status |"
echo "$row"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$row" >> "$GITHUB_STEP_SUMMARY"
exit "$status"
