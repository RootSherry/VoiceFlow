const { Queue } = require("bullmq");
const { createRedisConnection } = require("./redis");

const QUEUE_NAME = "voiceflow";

let queue;

function getQueue() {
  if (queue) return queue;
  const connection = createRedisConnection();
  queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: Number.parseInt(process.env.JOB_ATTEMPTS || "3", 10) || 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: true
    }
  });
  return queue;
}

module.exports = { QUEUE_NAME, getQueue };
