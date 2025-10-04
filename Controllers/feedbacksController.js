const Review = require('../Models/Reviews_model');
const Booking = require('../Models/Bookings_model');

// ✅ Create or update feedback
exports.createOrUpdateFeedback = async (req, res) => {
  try {
    const { bookingId, carId, clientId, feedbackText, rating } = req.body;

    if (!bookingId || !carId || !clientId || !feedbackText || !rating) {
      return res.status(400).json({ message: 'Missing required fields for feedback' });
    }

    const numericRating = parseFloat(rating);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ message: 'Rating must be a number between 1 and 5' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Invalid booking ID. Booking does not exist.' });
    }

    const existingFeedback = await Review.findOne({ bookingId, carId, clientId });

    // ✅ Update feedback
    if (existingFeedback) {
      if (booking.status !== 'SERVICEFINISHED') {
        return res.status(400).json({ message: 'Feedback can only be updated when booking is in SERVICEFINISHED state' });
      }

      existingFeedback.feedback = feedbackText;
      existingFeedback.rating = numericRating;
      await existingFeedback.save();

      return res.status(200).json({
        feedbackId: existingFeedback._id.toString(),
        systemMessage: 'Feedback has been successfully updated',
      });
    }

    // ✅ Create new feedback
    if (booking.status !== 'SERVICEPROVIDED') {
      return res.status(400).json({ message: 'Feedback can only be added when booking is in SERVICEPROVIDED state' });
    }

    const newFeedback = await Review.create({
      bookingId,
      carId,
      clientId,
      feedback: feedbackText,
      rating: numericRating,
    });

    // Update booking status to SERVICEFINISHED
    booking.status = 'SERVICEFINISHED';
    await booking.save();

    res.status(201).json({
      feedbackId: newFeedback._id.toString(),
      systemMessage: 'Feedback has been successfully created',
    });

  } catch (error) {
    console.error('createOrUpdateFeedback error:', error);
    res.status(500).json({ message: 'Failed to create/update feedback' });
  }
};

// ✅ Helper function for date formatting
const formatDate = (date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
};

// ✅ Get recent feedback
exports.getRecentFeedback = async (req, res) => {
  try {
    const feedbacks = await Review.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('carId', 'model images')
      .populate('clientId', 'firstName lastName address')
      .populate('bookingId', 'bookingNumber');

    const content = feedbacks
      .filter(fb => fb.clientId && fb.carId && fb.bookingId)
      .map((feedback) => {
        const { firstName, lastName, address } = feedback.clientId;
        const { model, images } = feedback.carId;
        const { bookingNumber } = feedback.bookingId;

        const city = address?.city;
        const country = address?.country;
        const location = city && country ? `${city}, ${country}` : "Unknown Location";

        const formattedDate = formatDate(feedback.createdAt);

        return {
          author: `${firstName} ${lastName?.slice(0, 1)}., ${location}`,
          carImageUrl: images?.[0] || null,
          carModel: model,
          date: formattedDate,
          feedbackId: feedback._id.toString(),
          feedbackText: feedback.feedback,
          orderHistory: `#${bookingNumber} (${formattedDate})`,
          rating: feedback.rating?.toFixed(1) || "0.0",
        };
      });

    res.status(200).json({ content });

  } catch (error) {
    console.error('getRecentFeedback error:', error);
    res.status(500).json({ message: 'Failed to fetch recent feedback' });
  }
};
