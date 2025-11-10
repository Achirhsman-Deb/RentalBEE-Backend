const FAQ = require('../Models/Faq_model');
const AboutUsModel = require('../Models/AboutUs_model');
const { redis,isRedisConnected } = require("../config/Redis_Connect");

//Get all FAQs
exports.getFAQs = async (req, res) => {
  try {
    const cacheKey = "faqs:all";
    if (isRedisConnected()) {
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          return res.status(200).json(JSON.parse(cachedData));
        }
      } catch (cacheErr) {
        console.warn("⚠️ Redis cache read failed, skipping cache:", cacheErr.message);
      }
    }

    const faqs = await FAQ.find({});
    const response = { content: faqs };

    if (isRedisConnected()) {
      try {
        await redis.set(cacheKey, JSON.stringify(response));
      } catch (cacheErr) {
        console.warn("⚠️ Redis cache write failed, continuing without cache:", cacheErr.message);
      }
    }

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ error: "Error fetching FAQs" });
  }
};

//Get About Us content
exports.getAboutUs = async (req, res) => {
  try {
    const cacheKey = "aboutus:content";
    if (isRedisConnected()) {
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          return res.status(200).json(JSON.parse(cachedData));
        }
      } catch (cacheErr) {
        console.warn("⚠️ Redis cache read failed, skipping cache:", cacheErr.message);
      }
    }

    const data = await AboutUsModel.find({});
    const response = { content: data };

    if (isRedisConnected()) {
      try {
        await redis.set(cacheKey, JSON.stringify(response));
      } catch (cacheErr) {
        console.warn("⚠️ Redis cache write failed, continuing without cache:", cacheErr.message);
      }
    }

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ error: "Content can't be displayed" });
  }
};