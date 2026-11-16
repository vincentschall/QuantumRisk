# Deploying the game server

The game server runs in Docker on the VPS, behind Caddy, which serves HTTPS for
`play.vincentschall.com` with an automatic Let's Encrypt certificate. The web client is deployed
separately to GitHub Pages (`.github/workflows/pages.yml`).

## Files

- `../Dockerfile`: compiles the server with `tsconfig.server.json` and runs it on Node 22 as the
  unprivileged `node` user (uid 1000), with no dev dependencies.
- `docker-compose.yml`: the `game` and `caddy` services. Both restart unless stopped.
- `Caddyfile`: reverse proxy for `{$DOMAIN}`.

## Server settings (`../.env`, never committed)

```
MOTH_API_KEY=…
ALLOWED_ORIGINS=https://vincentschall.com
MOTH_DAILY_CREDITS=100
```

Compose sets `TRUST_PROXY=1`, so the server takes client IPs from Caddy's `X-Forwarded-For`.

## Volumes

- `../quantum-pool/` holds `pool.json` (pre-fetched QPU bits) and `budget.json` (Moth credits
  spent today). It must be writable by uid 1000: `sudo chown -R 1000:1000 quantum-pool`.
- Caddy keeps its certificates in the `caddy-data` volume.

## Commands (run in `deploy/`)

```sh
docker compose up -d --build        # build and (re)start
docker compose logs -f game         # server log
curl https://play.vincentschall.com/health
docker compose exec game node src/node/mothCli.js pool   # pool status
docker compose exec game node src/node/mothCli.js fill   # top up the pool with QPU bits
```

A redeploy is `git pull` followed by `docker compose up -d --build`. Games live in memory, so a
restart ends the games that are running.

## Local test

```sh
DOMAIN=localhost docker compose up --build
```

Caddy then serves `https://localhost` with its own local certificate. The browser asks you to
accept it once. `curl -k https://localhost/health` should report `"ok": true`.

## Abuse limits (`src/server/main.ts`)

- 20 open connections per IP.
- 30 new games per IP per hour.
- 10 messages per second per connection, with bursts of up to 30.
- `MOTH_DAILY_CREDITS` per UTC day for live Moth jobs. When the budget is used up, measurements
  come from the bit pool and then from local randomness, which the game log labels as such.
