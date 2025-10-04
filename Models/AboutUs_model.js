const mongoose = require('mongoose');

const AboutUsSchema = new mongoose.Schema({
  description: String,
  numericValue: String,
  title: String,
});

module.exports = mongoose.model('AboutUs', AboutUsSchema);
