# MTXProject service monitor on Vercel

This repository serves the public site and its monitoring API from Vercel. A private Vercel Schedule runs every ten minutes, checks the website and configured APIs, stores checks and incidents in MongoDB Atlas, and sends Telegram and/or email alerts when an incident opens or recovers.

The monitoring implementation is prepared locally but is not active until its Vercel deployment and monitor-only environment variables are configured. The existing API and bot services are already deployed; this setup does not require changing their environment variables or credentials. Never put their keys or bot session data in this repository.

## What it verifies

- The website returns a successful HTTP response.
- Better-Api `/healthz` returns HTTP 200 with `status: "ok"` and `database: "connected"`.
- MTXALLAPI `/healthz` returns the same database-ready response.
- Messenger Bot stays `UNKNOWN` until it sends an authenticated heartbeat; a heartbeat overdue for two expected intervals makes it `OFFLINE`.
- A failure must appear in two consecutive checks before an incident opens. Two consecutive healthy checks resolve an incident. Duplicate alerts are suppressed while an incident is open.

The monitor marks results older than twenty minutes `UNKNOWN`. Check history is pruned after 90 days. The status page uses the same freshness window.

## Vercel setup

1. Import this repository into Vercel and deploy it as a Node.js project. The static site and API functions can share this project.
2. Create a MongoDB database user limited to the `mtxproject_monitor` database and provide the cluster connection URI as `MONGODB_URI`. Set `MONITOR_DB_NAME=mtxproject_monitor`.
3. Add the service URLs: `SITE_URL`, `BETTER_API_HEALTH_URL`, and `MTXALLAPI_HEALTH_URL`. API URLs must end in `/healthz`.
4. Set `SITE_ORIGINS` to the exact public site origin so the static page can read `/api/status.json`.
5. Configure both required alert channels: Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) and email (`RESEND_API_KEY`, `ALERT_EMAIL`, and a Resend-verified `ALERT_FROM`). Verify delivery for both before relying on alerts.
6. Heartbeat support is prepared in the FukeyBot deployment branch, but the currently deployed bot will not report until that code is deployed. Then set `MTXPROJECT_HEARTBEAT_URL` in Render to the monitor's HTTPS `/api/heartbeat/messenger-bot` endpoint and set the same newly generated token as `MTXPROJECT_HEARTBEAT_TOKEN` in Render and `HEARTBEAT_TOKEN_MESSENGER_BOT` in Vercel. FukeyBot reports only while its MQTT socket is connected. Never commit or share the token. Until the integration is deployed and configured, bot status remains `UNKNOWN`.
7. Deploy and inspect the Vercel function and schedule logs. Confirm a successful check and a test alert before relying on notifications.

Vercel's schedule is configured for every ten minutes in `vercel.json`. MongoDB collections and indexes are created automatically on the first scheduled run. No real secrets belong in this repository.

Vercel Hobby currently includes 5,000 schedule runs per month. A ten-minute cadence uses about 4,320 runs in 30 days or 4,464 in 31 days, leaving limited room for additional schedules or retries. Check [Vercel's current schedule limits](https://vercel.com/changelog/vercel-schedules-is-now-in-public-beta) before relying on it.

## Environment variables

See the repository `.env.example` for variable names and non-secret defaults. Set secrets in the Vercel project's Environment Variables page.

## Service health URLs

- `SITE_URL`: deployed site homepage.
- `BETTER_API_HEALTH_URL`: `https://better-api-eta.vercel.app/healthz`.
- `MTXALLAPI_HEALTH_URL`: `https://mtxallapi.onrender.com/healthz`.
- `https://fukeybot.onrender.com/` is the bot's public web endpoint, but an HTTP response there does not prove the Messenger connection is authenticated or active. The bot remains `UNKNOWN` until its real connection heartbeat is integrated.

Use a separate MongoDB database per application, even when multiple databases share the same free cluster. The monitor only stores health outcomes and heartbeat timestamps; it does not store bot sessions or application secrets.

## Limits and recovery

Free provider quotas and capacity can limit uptime, check frequency, history, or alert delivery. This is monitoring, not an availability guarantee. Keep an export if long-term incident history is required.
