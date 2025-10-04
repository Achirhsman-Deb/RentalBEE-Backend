const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    passwordHash: { 
      type: String, 
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['CLIENT', 'ADMIN', 'SUPPORT_AGENT'],
      default: 'CLIENT',
    },
    imageUrl: {
      type: String,
    },
    phoneNumber: {
      type: String,
    },
    address: {
      street: { type: String },
      city: { type: String },
      country: { type: String },
      postalCode: { type: String },
    },

    // Aadhaar Card document
    aadhaarCard: {
      documentUrl: { type: String },
      nodeHandle: { type: String },
      status: {
        type: String,
        enum: ['VERIFIED', 'UNVERIFIED'],
        default: 'UNVERIFIED',
      },
    },

    // Driving License document
    drivingLicense: {
      documentUrl: { type: String },
      nodeHandle: { type: String },
      status: {
        type: String,
        enum: ['VERIFIED', 'UNVERIFIED'],
        default: 'UNVERIFIED',
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
