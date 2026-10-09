#!/usr/bin/env bash
# Regression checks for deployment ordering and rollback; no real Docker or SSH calls.
set -Eeuo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
workspace=${1:-"$script_dir/../report/deploy-tests"}
mkdir -p "$workspace"
workspace=$(cd -- "$workspace" && pwd)
export MOCK_COMMIT=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
docker() {
  printf 'docker %s\n' "$*" >> "$MOCK_LOG"
  case "$1" in
    inspect)
      if [[ "$2" == -f ]]; then
        if [[ "$MOCK_SCENARIO" == unhealthy ]]; then echo unhealthy; else echo healthy; fi
      fi ;;
    exec)
      if [[ "$*" == *'nginx -t' && "$MOCK_SCENARIO" == invalid-config && ! -f "$MOCK_STATE/rejected" ]]; then
        touch "$MOCK_STATE/rejected"; return 1
      fi ;;
  esac
  return 0
}
curl() {
  echo 'curl health' >> "$MOCK_LOG"
  if [[ "$MOCK_SCENARIO" == wrong-commit ]]; then echo '{"commit":"previous"}'; else printf '{"commit":"%s"}\n' "$MOCK_COMMIT"; fi
}
sleep() { echo "sleep $*" >> "$MOCK_LOG"; }
flock() { echo "flock $*" >> "$MOCK_LOG"; }
export -f docker curl sleep flock
for scenario in success unhealthy invalid-config wrong-commit; do
  export MOCK_SCENARIO=$scenario MOCK_STATE="$workspace/$scenario" DEPLOY_STATE_DIR="$workspace/$scenario"
  export MOCK_LOG="$workspace/$scenario/commands.log"
  mkdir -p "$MOCK_STATE/nginx"
  rm -f "$MOCK_STATE/rejected"
  echo api-blue > "$MOCK_STATE/active"
  echo 'previous config' > "$MOCK_STATE/nginx/default.conf"
  : > "$MOCK_LOG"
  result=0
  bash "$script_dir/deploy.sh" "example/backend-api:$MOCK_COMMIT" "$MOCK_COMMIT" > "$MOCK_STATE/output.log" 2>&1 || result=$?
  if [[ "$scenario" == success ]]; then
    [[ "$result" == 0 && $(cat "$MOCK_STATE/active") == api-green ]]
    grep -q 'server api-green:3000' "$MOCK_STATE/nginx/default.conf"
    reload=$(grep -n 'nginx -s reload' "$MOCK_LOG" | head -1 | cut -d: -f1)
    verify=$(grep -n 'curl health' "$MOCK_LOG" | head -1 | cut -d: -f1)
    stop=$(grep -n 'docker stop -t 30 api-blue' "$MOCK_LOG" | head -1 | cut -d: -f1)
    [[ "$reload" -lt "$verify" && "$verify" -lt "$stop" ]]
  else
    [[ "$result" != 0 && $(cat "$MOCK_STATE/active") == api-blue ]]
    ! grep -q 'docker stop -t 30 api-blue' "$MOCK_LOG"
    grep -q 'docker rm -f api-green' "$MOCK_LOG"
    if [[ "$scenario" != unhealthy ]]; then [[ $(cat "$MOCK_STATE/nginx/default.conf") == 'previous config' ]]; fi
  fi
  echo "PASS deploy: $scenario"
done
