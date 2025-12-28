const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const projectRoot = path.resolve(__dirname, "..");
const envFiles = [];
if (process.env.NODE_ENV === "production") {
  envFiles.push(".env.production.local", ".env.production");
}
envFiles.push(".env.local", ".env");

for (const file of envFiles) {
  const p = path.join(projectRoot, file);
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
}

const { Worker } = require("bullmq");
const { QUEUE_NAME } = require("../server/queue/voiceflowQueue");
const { createRedisConnection } = require("../server/queue/redis");
const { processRecordingJob } = require("../server/worker/processRecording");

const concurrency = Number.parseInt(process.env.WORKER_CONCURRENCY || "1", 10) || 1;

const connection = createRedisConnection();

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const recordingId = job?.data?.recordingId;
    return processRecordingJob({ recordingId });
  },
  { connection, concurrency }
);

worker.on("ready", () => {
  console.log(`[worker] ready queue=${QUEUE_NAME} concurrency=${concurrency}`);
});

worker.on("completed", (job) => {
  console.log(`[worker] completed id=${job.id} name=${job.name}`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] failed id=${job?.id} name=${job?.name} err=${err?.message || err}`);
});

async function shutdown(signal) {
  console.log(`[worker] shutdown signal=${signal}`);
  try {
    await worker.close();
  } catch {}
  try {
    await connection.quit();
  } catch {}
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
