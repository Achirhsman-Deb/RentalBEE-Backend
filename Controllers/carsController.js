const Car = require("../Models/Cars_model");
const { format, parseISO, startOfDay, endOfDay } = require('date-fns');
const Review = require('../Models/Reviews_model');
const Booking = require('../Models/Bookings_model');
const mongoose = require('mongoose');
const moment = require('moment');

const checkAvailability = async (carId, startDate, endDate) => {
  const bookings = await Booking.find({ carId });

  for (const booking of bookings) {
    const existingStart = parseISO(booking.pickupDateTime);
    const existingEnd = parseISO(booking.dropoffDateTime);

    const overlaps = (startDate <= existingEnd && endDate >= existingStart);

    if (overlaps) {
      return "RESERVED";
    }
  }
  return "AVAILABLE";
};

// ✅ Get all cars with filters
exports.getAllCars = async (req, res) => {
  try {
    const {
      pickupLocationId,
      dropoffLocationId,
      pickupDateTime,
      dropOffDateTime,
      category,
      gearBoxType,
      fuelType,
      minPrice,
      maxPrice,
      page = 1,
      size = 10,
    } = req.query;

    const filter = {};

    // ✅ Handle pickup location
    if (pickupLocationId && mongoose.isValidObjectId(pickupLocationId)) {
      filter.locationIds = { $in: [new mongoose.Types.ObjectId(pickupLocationId)] };
    }

    // ✅ Handle dropoff location (merge if pickup exists)
    if (dropoffLocationId && mongoose.isValidObjectId(dropoffLocationId)) {
      if (filter.locationIds) {
        filter.locationIds.$in.push(new mongoose.Types.ObjectId(dropoffLocationId));
      } else {
        filter.locationIds = { $in: [new mongoose.Types.ObjectId(dropoffLocationId)] };
      }
    }

    // ✅ Category / Gearbox / FuelType (always uppercase for consistency)
    if (category) filter.category = category.toUpperCase();
    if (gearBoxType) filter.gearBoxType = gearBoxType.toUpperCase();
    if (fuelType) filter.fuelType = fuelType.toUpperCase();

    // ✅ Price range filter
    if (minPrice || maxPrice) {
      filter.pricePerDay = {};
      if (minPrice) filter.pricePerDay.$gte = Number(minPrice); // use gte not gt
      if (maxPrice) filter.pricePerDay.$lte = Number(maxPrice);
    }

    const pageNum = Math.max(parseInt(page, 10), 1);
    const pageSize = Math.max(parseInt(size, 10), 1);

    // ✅ Count total cars before pagination
    const totalElements = await Car.countDocuments(filter);
    const totalPages = Math.ceil(totalElements / pageSize);

    // ✅ Fetch cars with pagination
    const cars = await Car.find(filter)
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .populate("locationIds");

    // ✅ Parse dates safely
    const parsedPickup = pickupDateTime ? parseISO(pickupDateTime) : startOfDay(new Date());
    const parsedDropoff = dropOffDateTime ? parseISO(dropOffDateTime) : endOfDay(new Date());

    // ✅ Map cars with availability
    const responseContent = await Promise.all(
      cars.map(async (car) => {
        const status = await checkAvailability(car._id, parsedPickup, parsedDropoff);

        const firstLocation = car.locationIds?.[0];
        const locationText = firstLocation
          ? `${firstLocation.locationName}, ${firstLocation.locationAddress}`
          : "Unknown";

        return {
          carId: car._id,
          carRating: car.carRating,
          imageUrl: car.images?.[0] || "",
          location: locationText,
          model: car.model,
          pricePerDay: car.pricePerDay,
          serviceRating: car.serviceRating,
          status,
        };
      })
    );

    res.status(200).json({
      content: responseContent,
      currentPage: pageNum,
      totalElements,
      totalPages,
    });

  } catch (err) {
    console.error("getAllCars error:", err);
    res.status(500).json({ message: "Unable to get cars", error: err.message });
  }
};

// ✅ Get car by ID
exports.getCarById = async (req, res) => {
  try {
    const { carId } = req.params;
    const car = await Car.findById(carId);

    if (!car) return res.status(404).json({ message: 'Car not found' });

    const parsedPickup = startOfDay(new Date());
    const parsedDropoff = endOfDay(new Date());
    const status = await checkAvailability(car._id, parsedPickup, parsedDropoff);

    const firstLocation = car.locationIds[0];
    const locationText = firstLocation
      ? `${firstLocation.locationName}, ${firstLocation.locationAddress}`
      : 'Unknown';

    res.status(200).json({
      carId: car._id,
      carRating: car.carRating,
      climateControlOption: car.climateControlOption,
      engineCapacity: car.engineCapacity,
      fuelConsumption: car.fuelConsumption,
      fuelType: car.fuelType,
      gearBoxType: car.gearBoxType,
      images: car.images,
      location: locationText,
      locationIds: car.locationIds,
      model: car.model,
      passengerCapacity: car.passengerCapacity,
      pricePerDay: car.pricePerDay,
      serviceRating: car.serviceRating,
      status,
    });

  } catch (err) {
    console.error('getCarById error:', err);
    res.status(500).json({ message: 'Unable to get car by ID' });
  }
};

// Helper function
const getAllBookingDates = (pickupDateTimeStr, dropoffDateTimeStr) => {
  const dates = [];
  const startDate = moment(pickupDateTimeStr, moment.ISO_8601).startOf('day');
  const endDate = moment(dropoffDateTimeStr, moment.ISO_8601).startOf('day');

  if (!startDate.isValid() || !endDate.isValid()) return dates;

  let currentDate = startDate.clone();
  while (currentDate <= endDate) {
    dates.push(currentDate.format('YYYY-MM-DD'));
    currentDate.add(1, 'days');
  }

  return dates;
};

// ✅ Get booked days of a car
exports.getCarBookedDays = async (req, res) => {
  try {
    const { carId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(carId)) {
      return res.status(400).json({ message: 'Invalid carId format' });
    }

    const bookings = await Booking.find({
      carId: new mongoose.Types.ObjectId(carId),
      status: { $ne: 'CANCELED' },
    }).lean();

    let bookedDates = [];
    bookings.forEach((booking) => {
      bookedDates = bookedDates.concat(getAllBookingDates(booking.pickupDateTime, booking.dropoffDateTime));
    });

    const uniqueSortedDates = [...new Set(bookedDates)].sort();

    res.status(200).json({ content: uniqueSortedDates });

  } catch (err) {
    console.error('getCarBookedDays error:', err);
    res.status(500).json({ message: 'Failed to fetch booked days' });
  }
};

// ✅ Get client reviews
exports.getClientReviewsByCarId = async (req, res) => {
  try {
    const { carId } = req.params;
    const { page = 0, size = 10, sort = 'DATE', direction = 'DESC' } = req.query;

    const sortField = sort === 'DATE' ? 'createdAt' : 'createdAt';
    const sortOrder = direction === 'DESC' ? -1 : 1;

    const totalElements = await Review.countDocuments({ carId });

    const reviews = await Review.find({ carId })
      .populate('clientId', 'firstName lastName imageUrl')
      .sort({ [sortField]: sortOrder })
      .skip(page * size)
      .limit(size);

    const content = reviews.map((review) => {
      const { firstName, lastName, imageUrl } = review.clientId || {};
      return {
        author: `${firstName} ${lastName?.slice(0, 1) || ''}.` || 'Anonymous',
        authorImageUrl: imageUrl || '',
        date: format(new Date(review.createdAt), 'dd.MM.yyyy'),
        rentalExperience: review.rating.toFixed(1),
        text: review.feedback,
      }
    });

    const totalPages = Math.ceil(totalElements / size);

    res.status(200).json({
      content,
      currentPage: Number(page),
      totalElements,
      totalPages,
    });

  } catch (err) {
    console.error('getClientReviewsByCarId error:', err);
    res.status(500).json({ message: 'Failed to fetch client reviews.' });
  }
};

// ✅ Get popular cars
exports.getPopularCars = async (req, res) => {
  try {
    const cars = await Car.find().populate('locationIds');

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const content = await Promise.all(
      cars.map(async (car) => {
        const status = await checkAvailability(car._id, todayStart, todayEnd);
        const firstLocation = car.locationIds[0];
        const locationText = firstLocation
          ? `${firstLocation.locationName}, ${firstLocation.locationAddress}`
          : 'Unknown';

        return {
          carId: car._id,
          model: car.model,
          imageUrl: car.images[0] || '',
          pricePerDay: car.pricePerDay,
          carRating: car.carRating?.toFixed(1) || "0.0",
          serviceRating: car.serviceRating?.toFixed(1) || "0.0",
          location: locationText,
          status,
        };
      })
    );

    res.status(200).json({ content });

  } catch (err) {
    console.error('getPopularCars error:', err);
    res.status(500).json({ message: 'Failed to fetch cars.' });
  }
};
