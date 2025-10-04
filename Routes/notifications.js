const express = require("express");
const { authMiddleware } = require("../Middlewares/auth");
const { getNotifications, createNotification, deleteNotification } = require("../Controllers/notificationController");
const router = express.Router();

//Fetch notification in frontend
router.get("/", authMiddleware, getNotifications);

// Create a new notification by backend call
router.post("/",authMiddleware, createNotification);

// Mark notification as read by frontend
router.patch("/:id/read", authMiddleware, deleteNotification);

// Delete notification by frontend
router.delete("/:id", authMiddleware, deleteNotification);

module.exports = router;