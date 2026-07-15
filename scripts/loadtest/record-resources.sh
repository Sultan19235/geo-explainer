#!/usr/bin/env bash
# record-resources.sh — run ON the Hetzner box during a load test.
# Writes one CSV row every 5 seconds: whole-box CPU %, the quiz server's own
# CPU % and memory, open connections on :3001, box memory and load average.
#
#   bash record-resources.sh              # writes quiz-load-<timestamp>.csv
#   bash record-resources.sh myrun.csv    # custom filename
#
# Stop with Ctrl-C. Linux-only (reads /proc). Safe to leave running — it costs
# a fraction of a percent of CPU itself.

set -u

OUT="${1:-quiz-load-$(date +%Y%m%d-%H%M%S).csv}"
INTERVAL=5

# The quiz server's pid: prefer pm2's answer, fall back to pgrep.
find_pid() {
  local pid
  pid=$(pm2 pid mathsabaq-live 2>/dev/null | tr -d '[:space:]')
  if [[ -z "$pid" || "$pid" == "0" ]]; then
    pid=$(pgrep -f 'node.*server\.js' | head -1)
  fi
  echo "$pid"
}

PID=$(find_pid)
if [[ -z "$PID" ]]; then
  echo "quiz server process not found (pm2 name mathsabaq-live) — recording box stats only" >&2
fi

NCPU=$(nproc)
CLK=$(getconf CLK_TCK)

# whole-box CPU: delta of /proc/stat between samples
read_total() { awk '/^cpu /{idle=$5+$6; total=0; for(i=2;i<=NF;i++) total+=$i; print total, idle}' /proc/stat; }
# process CPU: utime+stime ticks from /proc/PID/stat (fields 14,15)
read_proc() {
  if [[ -n "$PID" && -r "/proc/$PID/stat" ]]; then
    awk '{print $14+$15}' "/proc/$PID/stat"
  else echo 0; fi
}

echo "time,box_cpu_pct,node_cpu_pct,node_rss_mb,conns_3001,box_mem_used_mb,load1" > "$OUT"
echo "recording to $OUT every ${INTERVAL}s — Ctrl-C to stop"

read T0 I0 < <(read_total)
P0=$(read_proc)

while true; do
  sleep "$INTERVAL"

  # re-find the pid if the server restarted mid-test
  if [[ -z "$PID" || ! -r "/proc/$PID/stat" ]]; then PID=$(find_pid); P0=$(read_proc); fi

  read T1 I1 < <(read_total)
  P1=$(read_proc)

  DT=$((T1 - T0)); DI=$((I1 - I0)); DP=$((P1 - P0))
  BOX_CPU=0; NODE_CPU=0
  if (( DT > 0 )); then
    BOX_CPU=$(awk -v dt="$DT" -v di="$DI" 'BEGIN{printf "%.1f", (dt-di)*100/dt}')
    # process ticks vs wall time; expressed in % of ONE core (can exceed 100 on multicore)
    NODE_CPU=$(awk -v dp="$DP" -v s="$INTERVAL" -v clk="$CLK" 'BEGIN{printf "%.1f", dp*100/(s*clk)}')
  fi
  T0=$T1; I0=$I1; P0=$P1

  RSS=0
  if [[ -n "$PID" && -r "/proc/$PID/status" ]]; then
    RSS=$(awk '/VmRSS/{printf "%.0f", $2/1024}' "/proc/$PID/status")
  fi

  CONNS=$(ss -Htn state established '( sport = :3001 )' 2>/dev/null | wc -l)
  MEM=$(free -m | awk '/^Mem:/{print $3}')
  LOAD1=$(awk '{print $1}' /proc/loadavg)

  echo "$(date +%H:%M:%S),$BOX_CPU,$NODE_CPU,$RSS,$CONNS,$MEM,$LOAD1" >> "$OUT"
done
