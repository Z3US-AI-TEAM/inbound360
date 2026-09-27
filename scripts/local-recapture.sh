#!/usr/bin/env bash
# Reinicia o banco de demonstração, o PostgREST e refaz todas as capturas. Uso: scripts/local-recapture.sh
set -uo pipefail
cd "$(dirname "$0")/.."
PID=$(pgrep -x postgrest); [ -n "$PID" ] && kill $PID; sleep 1
export PGHOST=/home/claude/pglocal PGPORT=5433 PGUSER=postgres
psql -d postgres -Atc "select count(pg_terminate_backend(pid)) from pg_stat_activity where datname='z3us' and pid<>pg_backend_pid();" >/dev/null
bash scripts/local-demo.sh 2>&1 | grep -v NOTICE | tail -1
(cd /home/claude/pgrst && setsid nohup ./postgrest postgrest.conf > pgrst.log 2>&1 < /dev/null & disown)
sleep 3; curl -s -o /dev/null -w "pgrst %{http_code}\n" http://localhost:3000/
rm -f shots/*.png; : > /home/claude/pgrst/api.log
timeout 1200 python3 scripts/capture.py 2>&1 | tail -3
echo "--- api 4xx/5xx:"; grep -E " (4[0-9]{2}|5[0-9]{2}) " /home/claude/pgrst/api.log | grep -v "functions/v1" | head
ls shots | wc -l; echo DONE
