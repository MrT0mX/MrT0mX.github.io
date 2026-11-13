const { getDatabase, ensureServices, SERVICES } = require("./vercel-db");

const now = () => new Date();

async function runChecks(env = process.env) {
  const db = await getDatabase();
  await ensureServices(db);
  const checks = db.collection("checks");
  const servicesCollection = db.collection("services");
  const incidents = db.collection("incidents");
  const services = await servicesCollection.find({ enabled: true }).toArray();

  for (const service of services) {
    const result = service.kind === "heartbeat"
      ? await heartbeatCheck(service, servicesCollection)
      : await httpCheck(service, env);
    const checkedAt = now();
    await checks.insertOne({
      serviceId: service.id,
      state: result.state,
      checkedAt,
      latencyMs: result.latencyMs ?? null,
      detail: result.detail ?? null,
    });

    const recent = await checks.find({ serviceId: service.id })
      .sort({ checkedAt: -1 })
      .limit(2)
      .toArray();
    if (recent.length < 2) continue;

    if (recent[0].state === recent[1].state && ["offline", "degraded"].includes(result.state)) {
      const openedAt = checkedAt;
      try {
        const opened = await incidents.updateOne(
          { serviceId: service.id, state: "open" },
          { $setOnInsert: { serviceId: service.id, state: "open", openedAt, lastNotifiedAt: openedAt } },
          { upsert: true }
        );
        if (opened.upsertedCount) {
          await notify(env, `${service.name} is ${result.state.toUpperCase()}. ${result.detail || ""}`);
        }
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    }
    if (recent[0].state === "live" && recent[1].state === "live") {
      const resolvedAt = checkedAt;
      const resolved = await incidents.updateOne(
        { serviceId: service.id, state: "open" },
        { $set: { state: "resolved", resolvedAt } }
      );
      if (resolved.modifiedCount) {
        await notify(env, `${service.name} has recovered. Verified healthy at ${resolvedAt.toISOString()}.`);
      }
    }
  }
}

async function heartbeatCheck(service, servicesCollection) {
  const current = await servicesCollection.findOne({ id: service.id }, { projection: { heartbeatAt: 1 } });
  if (!current?.heartbeatAt) return { state: "unknown", detail: "No heartbeat received yet" };
  const age = Date.now() - new Date(current.heartbeatAt).getTime();
  return age <= service.expectedIntervalSeconds * 2000
    ? { state: "live", detail: "Recent authenticated heartbeat" }
    : { state: "offline", detail: "Heartbeat is overdue" };
}

async function httpCheck(service, env) {
  const target = service.checkUrl;
  if (!target) return { state: "unknown", detail: "Health URL is not configured" };
  const started = Date.now();
  try {
    const response = await fetch(target, {
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "MTXProject-Monitor/1.0" },
    });
    const latencyMs = Date.now() - started;
    if (service.id === "website" && new URL(response.url).origin !== new URL(target).origin) {
      return { state: "offline", latencyMs, detail: "Site redirected away from its configured domain" };
    }
    if (service.id === "better-api" || service.id === "mtxallapi") {
      const body = await response.json().catch(() => null);
      if (body?.status === "degraded" || body?.database === "disconnected") {
        return { state: "degraded", latencyMs, detail: "Health endpoint reports a dependency is not ready" };
      }
      if (!response.ok) return { state: "offline", latencyMs, detail: `HTTP ${response.status}` };
      if (!body || body.status !== "ok" || body.database !== "connected") {
        return { state: "degraded", latencyMs, detail: "Health endpoint did not confirm database readiness" };
      }
    } else if (!response.ok) {
      return { state: "offline", latencyMs, detail: `HTTP ${response.status}` };
    }
    return { state: "live", latencyMs, detail: "Health check passed" };
  } catch (error) {
    return {
      state: "offline",
      latencyMs: Date.now() - started,
      detail: error?.name === "TimeoutError" ? "Health check timed out" : "Health check failed",
    };
  }
}

async function notify(env, message) {
  const deliveries = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    deliveries.push(["Telegram", fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `MTXProject monitor: ${message}` }),
    })]);
  } else {
    console.error("Telegram alerts are not configured");
  }
  if (env.RESEND_API_KEY && env.ALERT_EMAIL && env.ALERT_FROM) {
    deliveries.push(["Email", fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.ALERT_FROM,
        to: [env.ALERT_EMAIL],
        subject: "MTXProject service alert",
        text: message,
      }),
    })]);
  } else {
    console.error("Email alerts are not configured");
  }
  await Promise.all(deliveries.map(async ([provider, request]) => {
    try {
      const response = await request;
      if (!response.ok) console.error(`${provider} alert failed with HTTP ${response.status}`);
    } catch (error) {
      console.error(`${provider} alert failed:`, error.message);
    }
  }));
}

module.exports = { runChecks };
