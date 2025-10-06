const Booking = require('../Models/Bookings_model');

exports.getAllBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.body;

    const filter = {};
    if (status) {
      filter.status = status;
    }

    const currentPage = Math.max(parseInt(page), 1);
    const perPage = Math.max(parseInt(limit), 1);

    const totalBookings = await Booking.countDocuments(filter);

    const bookings = await Booking.find(filter)
      .populate('carId', 'model images category')
      .populate('clientId', 'firstName lastName email phoneNumber')
      .populate('pickupLocationId', 'locationName locationAddress')
      .populate('dropoffLocationId', 'locationName locationAddress')
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * perPage)
      .limit(perPage)
      .lean();

    res.status(200).json({
      success: true,
      total: totalBookings,
      currentPage,
      totalPages: Math.ceil(totalBookings / perPage),
      bookings,
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

exports.reservationController = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;

    if (!bookingId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID and status are required',
      });
    }

    const validStatuses = [
      'RESERVED',
      'SERVICESTARTED',
      'SERVICEPROVIDED',
      'CANCELED',
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status provided',
      });
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    booking.status = status;
    await booking.save();

    const updatedBooking = await Booking.findById(bookingId)
      .populate('carId', 'model images category')
      .populate('clientId', 'firstName lastName email phoneNumber')
      .populate('pickupLocationId', 'locationName locationAddress')
      .populate('dropoffLocationId', 'locationName locationAddress');

    res.status(200).json({
      success: true,
      message: 'Booking status updated successfully',
      booking: updatedBooking,
    });
  } catch (error) {
    console.error('Error changing reservation status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
