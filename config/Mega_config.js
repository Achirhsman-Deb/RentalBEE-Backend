const { Storage } = require("megajs");

let megaStorage = null;

// Export a function that initializes Mega and waits until ready
const initMega = async () => {
  if (megaStorage) return megaStorage; // Already initialized

  return new Promise((resolve, reject) => {
    try {
      const storage = new Storage(
        {
          email: process.env.MEGA_EMAIL,
          password: process.env.MEGA_PASSWORD,
          keepalive: true,
          reconnect: true
        },
        (err) => {
          if (err) {
            console.error("Failed to connect to MEGA:", err.message);
            return reject(err);
          } else {
            console.log("✅ Connected to MEGA!");
            megaStorage = storage;
            resolve(storage);
          }
        }
      );

      storage.on("error", (err) => {
        console.error("MEGA runtime error:", err.message);
      });

      // Timeout fallback (10 seconds)
      setTimeout(() => {
        if (!storage.key) {
          console.warn("⚠️ MEGA connection timed out.");
        }
      }, 10000);

    } catch (err) {
      console.error("Unexpected MEGA init error:", err.message);
      reject(err);
    }
  });
};

module.exports = initMega;
