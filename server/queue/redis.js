const IORedis = require("ioredis");

function getRedisUrl() {
  return process.env.REDIS_URL || "redis://127.0.0.1:6379";
}

function createRedisConnection() {
  const url = getRedisUrl();
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  });
}

module.exports = { getRedisUrl, createRedisConnection };

