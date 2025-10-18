const Booking = require('../Models/Bookings_model');
const Car = require('../Models/Cars_model');
const User = require('../Models/Users_model');
const Location = require('../Models/Locations_model');
const moment = require('moment');
const mongoose = require('mongoose');
const { createAndSendNotification } = require('../config/SendGrid_Config');

const formatDate = (isoDate) => {
  const date = new Date(isoDate);
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getFullYear()).slice(-2)}`;
};

// ✅ Get all bookings
const getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('carId')
      .populate('clientId')
      .populate('pickupLocationId')
      .lean();

    const formatted = bookings.map((booking) => {
      const pickup = new Date(booking.pickupDateTime);
      const dropoff = new Date(booking.dropoffDateTime);

      return {
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber,
        BookingPeriod: `${pickup.toLocaleString('default', { month: 'short' })} ${pickup.getDate()} - ${dropoff.toLocaleString('default', { month: 'short' })} ${dropoff.getDate()}`,
        carModel: booking.carId?.model || "N/A",
        clientName: booking.clientId?.userName || "N/A",
        date: formatDate(pickup),
        location: booking.pickupLocationId?.locationName || "N/A",
        madeBy: "Client",
      };
    });

    res.json({ content: formatted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get bookings for a user
const getUserBookings = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid userId format.' });
    }

    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const bookings = await Booking.find({ clientId: userId })
      .populate('carId', '_id images model')
      .sort({ createdAt: -1 })
      .lean();

    if (!bookings || bookings.length === 0) {
      return res.status(204).json({ error: 'No bookings found for this user' });
    }

    const formatted = bookings.map((booking) => {
      const pickup = new Date(booking.pickupDateTime);
      return {
        bookingId: booking._id.toString(),
        carId: booking.carId._id,
        bookingStatus: booking.status,
        carImageUrl: booking.carId?.images?.[0] || '',
        carModel: booking.carId?.model,
        orderDetails: `#${booking.bookingNumber} (${moment(pickup).format('DD.MM.YYYY')})`
      };
    });

    res.json({ content: formatted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Create booking
const createBooking = async (req, res) => {
  try {
    const {
      carId,
      clientId,
      pickupDateTime,
      dropOffDateTime,
      pickupLocationId,
      dropOffLocationId,
    } = req.body;

    if (!carId || !clientId || !pickupDateTime || !dropOffDateTime || !pickupLocationId || !dropOffLocationId) {
      return res.status(400).json({
        success: false,
        error: { message: "Missing required booking fields", code: "MISSING_FIELDS" }
      });
    }

    const user = await User.findOne({ _id: clientId });
    if (!user) {
      return res.status(401).json({
        statusCode: 401,
        message: "Invalid user",
      });
    }

    let overallStatus = false;
    let changed = false;

    // Aadhaar check
    if (!user.aadhaarCard.documentUrl || user.aadhaarCard.documentUrl === "") {
      changed = true
      user.aadhaarCard.status = "UNVERIFIED";
    }
    // Driving License check
    if (!user.drivingLicense.documentUrl || user.drivingLicense.documentUrl === "") {
      changed = true
      user.drivingLicense.status = "UNVERIFIED";
    }
    if (changed) {
      await user.save();
    }

    // If both verified → overall status VERIFIED
    if (
      user.aadhaarCard.status === "VERIFIED" &&
      user.drivingLicense.status === "VERIFIED"
    ) {
      overallStatus = true;
    }

    if (!overallStatus) {
      return res.status(400).json({
        success: false,
        error: { message: "Your documents are not verified", code: "UNVERIFIED_DOCUMENT" }
      });
    }

    const pickup = new Date(pickupDateTime);
    const dropoff = new Date(dropOffDateTime);

    if (pickup >= dropoff) {
      return res.status(400).json({
        success: false,
        error: { message: "Dropoff must be after pickup", code: "INVALID_DATE_RANGE" }
      });
    }

    const now = new Date();
    const minPickupTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (pickup < minPickupTime) {
      return res.status(400).json({
        success: false,
        error: { message: "Pickup time must be at least 24 hours from now.", code: "INVALID_PICKUP_TIME" }
      });
    }

    const car = await Car.findById(carId);
    if (!car) {
      return res.status(404).json({
        success: false,
        error: { message: "Car not found", code: "CAR_NOT_FOUND" }
      });
    }

    const carLocationIds = car.locationIds.map(id => id.toString());
    if (!carLocationIds.includes(pickupLocationId) || !carLocationIds.includes(dropOffLocationId)) {
      return res.status(400).json({
        success: false,
        error: { message: "Selected pickup or dropoff location is not available for this car", code: "INVALID_LOCATION" }
      });
    }

    const isOverlapping = await Booking.findOne({
      carId: new mongoose.Types.ObjectId(carId),
      status: { $nin: ['CANCELED', 'SERVICEPROVIDED', 'SERVICEFINISHED'] },
      $or: [
        {
          pickupDateTime: { $lt: dropoff },
          dropoffDateTime: { $gt: pickup }
        }
      ]
    });

    if (isOverlapping) {
      return res.status(400).json({
        success: false,
        error: { message: "This car is already booked during the selected time period.", code: "OVERLAP" }
      });
    }

    const lastBooking = await Booking.findOne({}).sort({ bookingNumber: -1 }).lean();
    const nextBookingNumber = lastBooking
      ? (parseInt(lastBooking.bookingNumber, 10) + 1).toString().padStart(4, '0')
      : '0001';

    await Booking.create({
      carId,
      clientId,
      pickupLocationId,
      dropoffLocationId: dropOffLocationId,
      pickupDateTime,
      dropoffDateTime: dropOffDateTime,
      bookingNumber: nextBookingNumber,
      status: 'BOOKED',
    });

    const bookingDateFormatted = moment(pickup).format('DD.MM.YY');
    const message = `New booking was successfully created.\n${car.model} is booked for ${moment(pickup).format('MMM D')} - ${moment(dropoff).format('MMM D')}.\nYou can change booking details until 10:30 PM ${moment(pickup).format('D MMM')}.\nYour order: #${nextBookingNumber} (${bookingDateFormatted})`;

    (async () => {
      try {
        await createAndSendNotification({
          userId: user._id,
          title: "Reservation request recieved",
          message:
            `Your booking request for ${car.model} from ${moment(pickup).format('MMM D')} to ${moment(dropoff).format('MMM D')} has been recieved and we will notify you upon succesfull reservation.`,
          type: "info",
        });
      } catch (notifyErr) {
        console.error(
          `Failed to create notification for user ${result.userId}:`,
          notifyErr
        );
      }
    })();

    res.status(201).json({ success: true, message });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { message: err.message, code: "SERVER_ERROR" }
    });
  }
};


// ✅ Cancel booking
const cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { userId } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Only RESERVED or BOOKED can request/cancel
    if (!["RESERVED", "BOOKED"].includes(booking.status)) {
      return res.status(400).json({
        error: "Only bookings with RESERVED or BOOKED status can be canceled",
      });
    }

    // If status = RESERVED → directly store a cancel request (pending approval)
    if (booking.status === "RESERVED") {
      booking.cancelRequest = {
        requestedAt: new Date(),
        status: "PENDING",
      };
      await booking.save();

      // Send notification
      (async () => {
        try {
          await createAndSendNotification({
            userId,
            title: "Cancel Request Submitted",
            message: `Your cancel request for reservation ${booking._id} has been submitted successfully.`,
            type: "info",
          });
        } catch (notifyErr) {
          console.error(`Failed to notify user ${userId}:`, notifyErr);
        }
      })();

      return res.json({
        message: "Cancel request submitted successfully for RESERVED booking",
      });
    }

    // If status = BOOKED → check if within 12 hours, else just store cancel request
    if (booking.status === "BOOKED") {
      const createdAt = new Date(booking.createdAt);
      const now = new Date();
      const diffInHours = (now - createdAt) / (1000 * 60 * 60);

      if (diffInHours > 12) {
        // Too late to cancel immediately → store cancel request
        booking.cancelRequest = {
          requestedAt: new Date(),
          status: "PENDING",
        };
        await booking.save();

        (async () => {
          try {
            await createAndSendNotification({
              userId,
              title: "Cancel Request Pending Review",
              message: `Your cancel request for booking ${booking._id} has been recorded and is awaiting review.`,
              type: "warning",
            });
          } catch (notifyErr) {
            console.error(`Failed to notify user ${userId}:`, notifyErr);
          }
        })();

        return res.status(200).json({
          message:
            "Cancel request recorded (cannot auto-cancel as it's over 12 hours old)",
        });
      }

      // If within 12 hours → cancel immediately
      if (booking.clientId.toString() !== userId) {
        return res.status(403).json({ error: "You are not authorized to cancel this booking" });
      }

      const car = await Car.findById(booking.carId).select("model");
      const carName = car ? car.model : "the selected car";

      booking.status = "CANCELED";
      await booking.save();

      (async () => {
        try {
          await createAndSendNotification({
            userId,
            title: "Booking Canceled",
            message: `Your booking for ${carName} from ${moment(
              booking.pickup
            ).format("MMM D")} to ${moment(booking.dropoff).format(
              "MMM D"
            )} has been successfully canceled.`,
            type: "success",
          });
        } catch (notifyErr) {
          console.error(`Failed to create notification for user ${userId}:`, notifyErr);
        }
      })();

      return res.json({ message: "Booking canceled successfully" });
    }
  } catch (err) {
    console.error("Error canceling booking:", err);
    res.status(500).json({ error: err.message });
  }
};


// ✅ Get booking details
const getBookingDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId)
      .populate({
        path: 'carId',
        populate: {
          path: 'locationIds',
          model: 'Location',
        },
      })
      .populate('pickupLocationId')
      .populate('dropoffLocationId');

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const car = booking.carId;

    res.status(200).json({
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      bookingPeriod: {
        pickupDateTime: booking.pickupDateTime,
        dropoffDateTime: booking.dropoffDateTime,
      },
      car: {
        id: car._id,
        model: car.model,
        pricePerDay: car.pricePerDay,
        image: car.images?.[0] || null,
        locations: car.locationIds.map(loc => ({
          id: loc._id,
          name: loc.name,
          address: loc.address,
        })),
      },
      pickupLocation: {
        id: booking.pickupLocationId._id,
        name: booking.pickupLocationId.name,
        address: booking.pickupLocationId.address,
      },
      dropoffLocation: {
        id: booking.dropoffLocationId._id,
        name: booking.dropoffLocationId.name,
        address: booking.dropoffLocationId.address,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Edit booking
const editBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { userId, ...body } = req.body;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ error: 'Invalid bookingId format.' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid userId format.' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.clientId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'You are not authorized to edit this booking.' });
    }

    if (booking.status !== 'RESERVED') {
      return res.status(400).json({ error: `Cannot edit booking with status "${booking.status}". Only "RESERVED" bookings can be edited.` });
    }

    const { pickupDateTime, dropoffDateTime, pickupLocationId, dropoffLocationId } = body;
    const format = 'YYYY-MM-DD HH:mm';
    const now = moment();

    const parsedPickup = pickupDateTime ? moment(pickupDateTime, format, true) : null;
    const parsedDropoff = dropoffDateTime ? moment(dropoffDateTime, format, true) : null;

    if (pickupDateTime && !parsedPickup?.isValid()) {
      return res.status(400).json({ error: 'Invalid pickupDateTime format. Use "YYYY-MM-DD HH:mm".' });
    }
    if (dropoffDateTime && !parsedDropoff?.isValid()) {
      return res.status(400).json({ error: 'Invalid dropoffDateTime format. Use "YYYY-MM-DD HH:mm".' });
    }
    if (parsedPickup && parsedDropoff && !parsedPickup.isBefore(parsedDropoff)) {
      return res.status(400).json({ error: 'pickupDateTime must be before dropoffDateTime.' });
    }
    if (parsedPickup && parsedPickup.diff(now, 'hours') < 24) {
      return res.status(400).json({ error: 'pickupDateTime must be at least 24 hours from now.' });
    }

    const effectivePickup = pickupDateTime || booking.pickupDateTime;
    const effectiveDropoff = dropoffDateTime || booking.dropoffDateTime;

    const overlapping = await Booking.findOne({
      _id: { $ne: booking._id },
      carId: booking.carId,
      status: { $nin: ['CANCELED', 'SERVICEPROVIDED', 'SERVICEFINISHED'] },
      pickupDateTime: { $lt: effectiveDropoff },
      dropoffDateTime: { $gt: effectivePickup },
    });

    if (overlapping) {
      return res.status(400).json({ error: 'This car is already booked during the selected time period.' });
    }

    const car = await Car.findById(booking.carId);
    if (!car) return res.status(404).json({ error: 'Associated car not found.' });

    if (
      (pickupLocationId && !car.locationIds.some(id => id.equals(pickupLocationId))) ||
      (dropoffLocationId && !car.locationIds.some(id => id.equals(dropoffLocationId)))
    ) {
      return res.status(400).json({ error: 'Provided pickup/dropoff location is not allowed for this car.' });
    }

    if (pickupDateTime) booking.pickupDateTime = pickupDateTime;
    if (dropoffDateTime) booking.dropoffDateTime = dropoffDateTime;
    if (pickupLocationId) booking.pickupLocationId = pickupLocationId;
    if (dropoffLocationId) booking.dropoffLocationId = dropoffLocationId;

    await booking.save();
    res.json({ message: 'Your booking has been successfully updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAllBookings,
  getUserBookings,
  createBooking,
  cancelBooking,
  getBookingDetails,
  editBooking,
};