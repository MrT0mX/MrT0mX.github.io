const crypto = require("node:crypto");
const { getDatabase, ensureServices } = require("../../monitoring/vercel-db");

function sameSecret(actual, expected) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

module.exports = async function heartbeatHandler(req, res) {
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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const serviceId = String(req.query.service || "");
  if (serviceId !== "messenger-bot") return res.status(404).json({ error: "Unknown service" });
  const expected = process.env.HEARTBEAT_TOKEN_MESSENGER_BOT;
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!sameSecret(token, expected)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const db = await getDatabase();
    await ensureServices(db);
    const receivedAt = new Date();
    const result = await db.collection("services").updateOne(
      { id: serviceId, kind: "heartbeat", enabled: true },
      { $set: { heartbeatAt: receivedAt } }
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Unknown service" });
    return res.status(200).json({ ok: true, receivedAt: receivedAt.toISOString() });
  } catch (error) {
    console.error("Heartbeat write failed:", error.message);
    return res.status(503).json({ error: "Heartbeat is temporarily unavailable" });
  }
};
