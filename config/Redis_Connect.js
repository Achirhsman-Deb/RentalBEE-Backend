const Redis = require("ioredis");

let redis = null;
let connected = false;

try {
  redis = new Redis({
    host: "localhost",
    port: 6379,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
  });

  redis.on("connect", () => {
    connected = true;
    console.log("✅ Connected to Redis successfully");
  });

  redis.on("error", (err) => {
    if (connected) console.error("⚠️ Redis error:", err.message);
    else console.warn("⚠️ Redis unavailable, continuing without cache");
    connected = false;
  });

  redis.on("end", () => {
    if (connected) console.warn("⚠️ Redis connection closed");
    connected = false;
  });

} catch (error) {
  console.warn("⚠️ Redis unavailable, continuing without cache");
}

const isRedisConnected = () => connected;

module.exports = { redis, isRedisConnected };
