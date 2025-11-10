const express = require('express');
const router = express.Router();
const bookingController = require('../Controllers/bookingController');
const { authMiddleware } = require('../Middlewares/auth');

// Routes
// router.get('/', bookingController.getAllBookings);
router.get('/:userId',authMiddleware, bookingController.getUserBookings);
router.post('/', bookingController.createBooking);
router.put('/cancel/:bookingId',authMiddleware, bookingController.cancelBooking);
router.get('/details/:bookingId',authMiddleware, bookingController.getBookingDetails);
router.put('/edit/:bookingId', bookingController.editBooking);

module.exports = router;