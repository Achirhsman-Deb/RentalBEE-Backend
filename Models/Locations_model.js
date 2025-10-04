const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    locationName: {
      type: String,
      required: true,
    },
    locationAddress: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    locationUrl: {
      type: String,
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Location', locationSchema);
