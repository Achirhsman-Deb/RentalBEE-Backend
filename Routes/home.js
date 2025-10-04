const express = require("express");
const router = express.Router();

const { getAllLocations } = require("../Controllers/locationController");
const { getFAQs, getAboutUs } = require("../Controllers/homeController");

// GET /home/locations
router.get("/locations", getAllLocations);

// GET /home/faq
router.get("/faq", getFAQs);

// GET /home/about-us
router.get("/about-us", getAboutUs);

module.exports = router;
