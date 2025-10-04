const express = require("express");
const { createOrUpdateFeedback, getRecentFeedback } = require("../Controllers/feedbacksController");

const router = express.Router();

// Create or update feedback
router.post("/", createOrUpdateFeedback);

// Get recent feedback (latest 5)
router.get("/recent", getRecentFeedback);

module.exports = router;
