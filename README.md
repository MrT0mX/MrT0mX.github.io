# MTXProject

MTXProject is the developer hub and portfolio of Ratul Hassan (MrT0mX), planned for `https://mtxproject.is-a.dev/`. It brings together public repositories, deployed APIs and Messenger bots, libraries, tools, documentation, and a distinct Command Store area.

## Run locally

The site is plain HTML, CSS, and JavaScript with no build step. Serve this directory with any static server so the project cards and status configuration load correctly. For example, from the repository root run `python3 -m http.server 8000`, then open `http://localhost:8000`.

## Free static hosting

The site files are static and can be hosted on a free static hosting plan. The monitoring endpoints in `api/` need a Node.js function host and a separate MongoDB database. Configure the custom domain only after confirming the host and current `is-a.dev` DNS settings. The website itself does not need a database.

## Live service status

The status panel starts at `UNKNOWN`. Green `LIVE` requires a recent successful check. Better-Api and MTXALLAPI must report a ready database; bots need authenticated platform heartbeats. The frontend reads `status-endpoint.json`; set its `url` to the deployed monitor's `/api/status.json` only after that endpoint is configured. See [monitoring setup](monitoring/README.md).

Monitoring code is prepared for Vercel Functions and MongoDB Atlas. It is not operational until a monitor deployment, its environment settings, actual service health URLs, bot heartbeat integration, and alert delivery are configured and verified. This setup does not change the API or bot deployments or their credentials. Free hosting does not guarantee 24/7 uptime.

## Project catalog

The site lists the 14 repositories in the initial audit, plus the MTXProject hub itself and the separate `mtx-fca` library found in the connected local clones. Private or unpublished repositories remain out of the public catalog until their publication is confirmed. The Command Store is separate from `All-Commands`; its URL has not yet been recorded, so its button is not connected yet.

## License

This repository retains its Apache-2.0 license.
