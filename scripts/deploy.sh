#!/usr/bin/env bash
set -Eeuo pipefail
# Run on the EC2 host as a user permitted to use Docker.
image=${1:?image required}; commit=${2:?commit required}
[[ "$image" =~ ^[a-z0-9._/-]+:[a-f0-9]{40}$ ]] || { echo 'Invalid image'; exit 1; }
[[ "$commit" =~ ^[a-f0-9]{40}$ ]] || exit 1
state=${DEPLOY_STATE_DIR:-"$HOME/backend-api-deploy"}
mkdir -p "$state"
exec 9>"$state/deploy.lock"
flock -x 9
docker network inspect integrador >/dev/null 2>&1 || docker network create integrador
docker volume inspect integrador-data >/dev/null 2>&1 || docker volume create integrador-data
docker volume inspect integrador-backups >/dev/null 2>&1 || docker volume create integrador-backups
old=$(cat "$state/active" 2>/dev/null || true)
if [[ "$old" == api-blue ]]; then candidate=api-green; else candidate=api-blue; fi
docker pull "$image"
docker rm -f "$candidate" >/dev/null 2>&1 || true
docker run -d --name "$candidate" --network integrador --restart unless-stopped \
  -e COMMIT_SHA="$commit" -v integrador-data:/app/storage -v integrador-backups:/app/backups "$image"
healthy=false
for attempt in $(seq 1 30); do
  if [[ $(docker inspect -f '{{.State.Health.Status}}' "$candidate") == healthy ]]; then healthy=true; break; fi
  sleep 2
done
if [[ "$healthy" != true ]]; then
  docker logs "$candidate"
  docker rm -f "$candidate"
  echo 'Candidate failed; previous service remains active.' >&2
  exit 1
fi
mkdir -p "$state/nginx"
config="$state/nginx/default.conf"
rm -f "$state/previous.conf"
[[ ! -f "$config" ]] || cp "$config" "$state/previous.conf"
cat > "$config" <<EOF
upstream backend { server $candidate:3000; }
server {
  listen 80;
  location / {
    proxy_pass http://backend;
    proxy_connect_timeout 3s;
    proxy_read_timeout 15s;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
restore_config() {
  if [[ -f "$state/previous.conf" ]]; then
    cp "$state/previous.conf" "$config"
    docker exec api-proxy nginx -t && docker exec api-proxy nginx -s reload
  else
    docker rm -f api-proxy >/dev/null 2>&1 || true
  fi
}
if docker inspect api-proxy >/dev/null 2>&1; then
  docker start api-proxy >/dev/null
  if ! docker exec api-proxy nginx -t || ! docker exec api-proxy nginx -s reload; then
    restore_config; docker rm -f "$candidate"; exit 1
  fi
else
  docker run -d --name api-proxy --network integrador --restart unless-stopped \
    -p 80:80 -v "$state/nginx:/etc/nginx/conf.d:ro" nginx:stable-alpine
fi
verified=false
for attempt in $(seq 1 10); do
  if curl --fail --silent --connect-timeout 2 --max-time 5 http://127.0.0.1/api/health | grep -q "$commit"; then verified=true; break; fi
  sleep 2
done
if [[ "$verified" != true ]]; then
  restore_config
  sleep 30
  docker rm -f "$candidate"
  echo 'Proxy verification failed; candidate removed after rollback' >&2
  exit 1
fi
echo "$candidate" > "$state/active.next"
mv "$state/active.next" "$state/active"
# Allow in-flight requests on the prior Nginx worker to drain.
sleep 30
[[ -z "$old" || "$old" == "$candidate" ]] || docker stop -t 30 "$old"
echo "Deployed $commit to $candidate"
