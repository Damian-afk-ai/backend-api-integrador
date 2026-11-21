#!/usr/bin/env bash
set -Eeuo pipefail

ip=${1:?Se requiere la IP pública}
[[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
state=${DEPLOY_STATE_DIR:-"$HOME/backend-api-deploy"}
active=$(cat "$state/active")
[[ "$active" == api-blue || "$active" == api-green ]]
config="$state/nginx/default.conf"
acme="$state/nginx/acme"
certs="$state/letsencrypt"
mkdir -p "$acme" "$certs" "$state/https-nginx"
exec 9>"$state/deploy.lock"
flock -x 9

# Enable the challenge without replacing the existing HTTP routes.
backup=$(mktemp "$state/nginx-before-https.XXXXXX")
cp "$config" "$backup"
if ! grep -q '/.well-known/acme-challenge/' "$config"; then
    sed -i '/listen 80;/a\  location ^~ /.well-known/acme-challenge/ { root /etc/nginx/conf.d/acme; }' "$config"
    if ! docker exec api-proxy nginx -t || ! docker exec api-proxy nginx -s reload; then
        cp "$backup" "$config"
        exit 1
    fi
fi

certbot_image=certbot/certbot:v5.4.0
if ! docker image inspect "$certbot_image" >/dev/null 2>&1; then
    docker_config=$(mktemp -d)
    docker --config "$docker_config" pull "$certbot_image"
    rmdir "$docker_config"
fi
docker run --rm -v "$acme:/acme" -v "$certs:/etc/letsencrypt" "$certbot_image" certonly \
    --non-interactive --agree-tos --register-unsafely-without-email --webroot -w /acme \
    --preferred-profile shortlived --ip-address "$ip" --keep-until-expiring

cat > "$state/https-nginx/default.conf" <<EOF
server {
    listen 443 ssl;
    server_name $ip;
    ssl_certificate /etc/letsencrypt/live/$ip/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$ip/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    location / {
        proxy_pass http://api-proxy:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF
if ! grep -q 'listen 8080;' "$config"; then
    cat >> "$config" <<'EOF'
server {
    listen 8080;
    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF
fi
if ! docker exec api-proxy nginx -t || ! docker exec api-proxy nginx -s reload; then
    cp "$backup" "$config"
    exit 1
fi
if docker container inspect parcial2-https >/dev/null 2>&1; then
    docker start parcial2-https >/dev/null
    docker exec parcial2-https nginx -s reload
else
    docker run -d --name parcial2-https --network integrador --restart unless-stopped -p 443:443 \
        -v "$state/https-nginx:/etc/nginx/conf.d:ro" -v "$certs:/etc/letsencrypt:ro" nginx:stable-alpine >/dev/null
fi
curl --fail --silent --show-error --retry 5 --retry-all-errors --resolve "$ip:443:127.0.0.1" "https://$ip/api/health" >/dev/null
printf '%s\n' "$ip" > "$state/https-ip"

cat > "$state/renew-https.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
state=$(cd -- "$(dirname -- "$0")" && pwd)
docker run --rm -v "$state/nginx/acme:/acme" -v "$state/letsencrypt:/etc/letsencrypt" certbot/certbot:v5.4.0 renew --quiet
docker exec parcial2-https nginx -s reload
EOF
chmod 700 "$state/renew-https.sh"
( { crontab -l 2>/dev/null || true; } | awk '!/renew-https\.sh/'; printf '19 2,14 * * * /bin/bash "%s/renew-https.sh"\n' "$state" ) | crontab -
printf 'HTTPS listo en https://%s\n' "$ip"
