# MTXProject service monitor

This Cloudflare Worker is a free tier monitoring scaffold for the site. It polls service health every five minutes, stores checks and incidents in D1, publishes `/api/status.json`, and sends one Telegram and/or email alert when an incident opens or recovers.

## What it verifies

- The website returns a successful HTTP response.
- Better-Api `/healthz` returns HTTP 200 with `status: "ok"` and `database: "connected"`.
- MTXALLAPI `/healthz` returns the same database-ready response.
- Bot services stay `UNKNOWN` until they send an authenticated heartbeat; two missed checks after a heartbeat make them `OFFLINE`.
- A new failure must appear in two consecutive checks before an incident opens. Two consecutive healthy checks resolve an incident. Duplicate alerts are suppressed while an incident is open.

The monitor does not treat a running process, API homepage, or stale result as `LIVE`. Results older than ten minutes are `UNKNOWN`. Check history is pruned after 90 days.

## Setup

1. Create a free Cloudflare D1 database and apply `schema.sql`.
2. Copy `wrangler.toml.example` to `wrangler.toml`, then set the D1 database ID and the actual verified health URLs.
3. Add these Worker secrets with `wrangler secret put`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `RESEND_API_KEY`, `ALERT_EMAIL`, `ALERT_FROM`, and `HEARTBEAT_TOKEN_MESSENGER_BOT`.
4. Deploy the Worker on a free Cloudflare Workers plan. Add its public `/api/status.json` URL to `../status-endpoint.json` and configure CORS to the exact site origin.
5. Configure the single selected Messenger bot to POST to `/heartbeat/messenger-bot` every minute with `Authorization: Bearer <service-specific-token>`, only while its MQTT socket is connected. Never commit that token. Until the integration is installed, bot status remains `UNKNOWN`.
6. Verify a check and an alert from the provider dashboards before treating monitoring as operational.

`ALERT_FROM` must be a verified sender for the chosen Resend account. Email and Telegram remain unconfigured until their provider credentials and recipient details are added. This repository contains no real tokens.

## Service health URLs

- `BETTER_API_HEALTH_URL`: the deployed Better-Api `/healthz` endpoint.
- `MTXALLAPI_HEALTH_URL`: the deployed MTXALLAPI `/healthz` endpoint.
- `SITE_URL`: the deployed `https://mtxproject.is-a.dev` homepage.

The API endpoints include database readiness. Use separate MongoDB databases for Better-Api and MTXALLAPI, even if both databases share a free cluster.

## Limits and recovery

Free provider quotas and capacity can limit uptime, check frequency, history, or alert delivery. This is monitoring, not an availability guarantee. Export D1 incident/check data periodically if long-term history is needed. Do not store bot sessions or application secrets in D1; only heartbeat timestamps and health outcomes belong here.
