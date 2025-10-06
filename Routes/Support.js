const express = require("express");
const { authMiddleware } = require("../Middlewares/auth");
const supportAgentMiddleware = require("../Middlewares/SupportAgentMiddleware");
const { getAllBookings, reservationController } = require("../Controllers/SupportController");
const router = express.Router();

//Booking Routes
router.get("/get-orders", authMiddleware, supportAgentMiddleware, getAllBookings);
router.post("/reservations/:bookingId", authMiddleware, supportAgentMiddleware, reservationController);

module.exports = router;
