const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    dateFrom: {
      type: Date,
      required: true,
    },
    dateTo: {
      type: Date,
      required: true,
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
    },
    carId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Car',
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    supportAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reportType: {
      type: String,
      required: true,
      enum: ['Sales report', 'Staff performance'], 
    },
    generatedReport: {
      type: Object, 
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);