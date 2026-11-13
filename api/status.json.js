const { getDatabase, ensureServices, STATUS_TTL_MS } = require("../monitoring/vercel-db");

module.exports = async function statusHandler(req, res) {
  const origins = (process.env.SITE_ORIGINS || "https://mtxproject.is-a.dev")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (origin && origins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    return res.status(204).end();
  }
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const db = await getDatabase();
    await ensureServices(db);
    const [services, checks] = await Promise.all([
      db.collection("services").find({ enabled: true }).toArray(),
      db.collection("checks").aggregate([
        { $sort: { checkedAt: -1 } },
        { $group: { _id: "$serviceId", latest: { $first: "$$ROOT" } } },
      ]).toArray(),
    ]);
    const latestByService = new Map(checks.map((row) => [row._id, row.latest]));
    const output = {};
    let latest = null;
    for (const service of services) {
      const check = latestByService.get(service.id);
      const age = check ? Date.now() - new Date(check.checkedAt).getTime() : Infinity;
      const fresh = age >= 0 && age <= STATUS_TTL_MS;
      const state = fresh && ["live", "offline", "degraded", "unknown"].includes(check.state)
        ? check.state
        : "unknown";
      output[service.name] = {
        state,
        checkedAt: fresh ? new Date(check.checkedAt).toISOString() : null,
        latencyMs: fresh ? check.latencyMs ?? null : null,
      };
      if (fresh && (!latest || new Date(check.checkedAt) > new Date(latest))) {
        latest = new Date(check.checkedAt).toISOString();
      }
    }
    return res.status(200).json({ updatedAt: latest, services: output });
  } catch (error) {
    console.error("Public status read failed:", error.message);
    return res.status(503).json({ error: "Status is temporarily unavailable" });
  }
};
