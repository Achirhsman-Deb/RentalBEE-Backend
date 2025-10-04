const mongoose = require('mongoose');

const carSchema = new mongoose.Schema(
  {
    model: {
      type: String,
      required: true,
      trim: true,
    },
    locationIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Location',
        required: true,
      }
    ],
    images: {
      type: [String],
      default: [],
    },
    category: {
      type: String,
      enum: ['ECONOMY', 'COMFORT', 'BUSINESS', 'MINIVAN', 'PREMIUM', 'CROSSOVER', 'ELECTRIC'],
      required: true,
    },
    climateControlOption: {
      type: String,
      required: true,
    },
    engineCapacity: {
      type: String,
      required: true,
    },
    fuelConsumption: {
      type: String,
      required: true,
    },
    fuelType: {
      type: String,
      required: true,
    },
    gearBoxType: {
      type: String,
      required: true,
    },
    passengerCapacity: {
      type: String,
      required: true,
    },
    pricePerDay: {
      type: Number,
      required: true,
    },
    serviceRating: {
      type: Number,
      enum: [1, 2, 3, 4, 5],
      required: true,
    },
    carRating: {
      type: Number,
      required: true,
      default: 0,
      validate: {
        validator: function (value) {
          const num = parseFloat(value.toString());
          return num >= 0 && num <= 5;
        },
        message: 'carRating must be between 0 and 5.',
      },
    },
  },
  { timestamps: true }
);
module.exports = mongoose.model('Car', carSchema);