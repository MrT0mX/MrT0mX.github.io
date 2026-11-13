# MTXProject

MTXProject is the developer hub and portfolio of Ratul Hassan (MrT0mX), planned for `https://mtxproject.is-a.dev/`. It brings together the audited public repositories, Messenger/FCA work, APIs, libraries, tools, documentation, and a distinct Command Store area.

## Run locally

The site is plain HTML, CSS, and JavaScript with no build step. Serve this directory with any static server so the project cards and status configuration load correctly. For example, from the repository root run `python3 -m http.server 8000`, then open `http://localhost:8000`.

## Free static hosting

Deploy this repository root to GitHub Pages or Cloudflare Pages with no build command and no paid plan. Add the custom domain only after choosing the host and confirming the current `is-a.dev` DNS configuration. The site uses no database.

## Live service status

The status panel starts at `UNKNOWN`. Green `LIVE` requires a recent successful check. Better-Api and MTXALLAPI must report a ready database; bots need authenticated platform heartbeats. The frontend reads `status-endpoint.json`; set its `url` to the deployed monitor's `/api/status.json` only after that endpoint is configured. See [monitoring setup](monitoring/README.md).

The Worker source and D1 schema are a deployment scaffold. Monitoring is not active until the D1 database, health URLs, Worker secrets, Telegram/Email delivery, and bot heartbeat integrations are configured and verified. Free hosting does not guarantee 24/7 uptime.

## Project catalog

The site lists the 14 repositories in the initial audit, plus the MTXProject hub itself and the separate `mtx-fca` library found in the connected local clones. Private or unpublished repositories remain out of the public catalog until their publication is confirmed. The Command Store is separate from `All-Commands`; its URL has not yet been recorded.

## License

This repository retains its Apache-2.0 license.
