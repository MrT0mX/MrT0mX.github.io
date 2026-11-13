const { MongoClient } = require("mongodb");

const STATUS_TTL_MS = 20 * 60 * 1000;
const SERVICES = [
  { id: "website", name: "MTXProject Website", kind: "http", expectedIntervalSeconds: 600 },
  { id: "better-api", name: "Better-Api", kind: "http", expectedIntervalSeconds: 600 },
  { id: "mtxallapi", name: "MTXALLAPI", kind: "http", expectedIntervalSeconds: 600 },
  { id: "messenger-bot", name: "Messenger Bot", kind: "heartbeat", expectedIntervalSeconds: 300 },
];

let clientPromise;

async function getDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!clientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    clientPromise = client.connect().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  const client = await clientPromise;
  return client.db(process.env.MONITOR_DB_NAME || "mtxproject_monitor");
}

async function ensureServices(db) {
  const configured = SERVICES.map((service) => ({
    ...service,
    enabled: true,
    checkUrl: service.id === "website"
      ? process.env.SITE_HEALTH_URL || process.env.SITE_URL || ""
      : service.id === "better-api"
        ? process.env.BETTER_API_HEALTH_URL || ""
        : service.id === "mtxallapi"
          ? process.env.MTXALLAPI_HEALTH_URL || ""
          : null,
  }));
  await db.collection("services").bulkWrite(configured.map((service) => ({
    updateOne: {
      filter: { id: service.id },
      update: {
        $set: {
          name: service.name,
          kind: service.kind,
          enabled: service.enabled,
          checkUrl: service.checkUrl,
          expectedIntervalSeconds: service.expectedIntervalSeconds,
        },
        $setOnInsert: { createdAt: new Date() },
      },
      upsert: true,
    },
  })));
  await Promise.all([
    db.collection("checks").createIndex({ serviceId: 1, checkedAt: -1 }),
    db.collection("checks").createIndex({ checkedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }),
    db.collection("incidents").createIndex(
      { serviceId: 1 },
      { unique: true, partialFilterExpression: { state: "open" } }
    ),
  ]);
}

module.exports = { STATUS_TTL_MS, SERVICES, getDatabase, ensureServices };
