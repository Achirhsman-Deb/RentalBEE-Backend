const Location = require('../Models/Locations_model');
const { redis, isRedisConnected } = require("../config/Redis_Connect");

exports.getAllLocations = async (req, res) => {
  try {
    const cacheKey = "allLocations";
    if (isRedisConnected()) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return res.status(200).json(JSON.parse(cached));
        }
      } catch (cacheErr) {
        console.warn("⚠️ Redis read failed:", cacheErr.message);
      }
    }

    const locations = await Location.find().lean();

    const formattedLocations = locations.map((location) => ({
      locationAddress: location.locationAddress,
      locationId: location._id.toString(),
      locationUrl: location.locationUrl,
      locationName: location.locationName,
    }));

    const response = { content: formattedLocations };

    if (isRedisConnected()) {
      try {
        await redis.setex(cacheKey, 86400, JSON.stringify(response)); 
      } catch (cacheErr) {
        console.warn("⚠️ Redis write failed:", cacheErr.message);
      }
    }

    return res.status(200).json(response);
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Error fetching locations',
      }),
    };
  }
};
