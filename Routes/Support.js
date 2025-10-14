const express = require("express");
const { authMiddleware } = require("../Middlewares/auth");
const supportAgentMiddleware = require("../Middlewares/SupportAgentMiddleware");
const { reservationController, getUsersWithDocuments, getUserDocumentsById, updateDocumentStatus, getAllBookingsLite, getBookingById } = require("../Controllers/SupportController");
const router = express.Router();

//Booking Routes
router.get("/get-bookings", authMiddleware, supportAgentMiddleware, getAllBookingsLite);
router.get("/get-booking/:id", authMiddleware, supportAgentMiddleware, getBookingById);
router.post("/reservations/:bookingId", authMiddleware, supportAgentMiddleware, reservationController);

//Files Routes
router.get("/documents", authMiddleware, supportAgentMiddleware, getUsersWithDocuments);
router.get("/documents/:userId", authMiddleware, supportAgentMiddleware, getUserDocumentsById);
router.put("/documents/:userId", authMiddleware, supportAgentMiddleware, updateDocumentStatus);

module.exports = router;
