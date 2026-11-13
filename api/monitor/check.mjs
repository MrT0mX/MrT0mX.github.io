import { handleSchedule } from "@vercel/schedules";
import monitor from "../../monitoring/vercel-checks.js";

export const POST = handleSchedule(async () => {
  await monitor.runChecks(process.env);
});
