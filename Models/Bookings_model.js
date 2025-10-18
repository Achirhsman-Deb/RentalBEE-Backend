const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Car',
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    pickupDateTime: {
      type: String,
      required: true,
    },
    dropoffDateTime: {
      type: String,
      required: true,
    },
    pickupLocationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    dropoffLocationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    bookingNumber: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["BOOKED", "RESERVED", "SERVICESTARTED", "SERVICEPROVIDED", "SERVICEFINISHED", "CANCELED"],
      required: true,
    },
    cancelRequest: {
      requestedAt: { type: Date },
      status: {
        type: String,
        enum: ["NONE", "PENDING", "APPROVED", "REJECTED"],
        default: "NONE",
      },
      reviewedAt: { type: Date },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
