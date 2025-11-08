// config/redisClient.js
const Redis = require("ioredis");

// Create a new Redis client instance
// Assuming your Redis container is accessible via 'localhost' on port 6379
// If using Docker Compose, use the service name instead of 'localhost' (e.g., 'redis')
const redis = new Redis({
  host: "localhost",
  port: 6379,
});

redis.on("connect", () => {
  console.log("✅ Connected to Redis successfully");
});

redis.on("error", (err) => {
  console.error("❌ Redis connection error:", err);
});

module.exports = redis;
