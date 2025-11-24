const Car = require("../Models/Cars_model");
const { format, parseISO, startOfDay, endOfDay } = require('date-fns');
const Review = require('../Models/Reviews_model');
const Booking = require('../Models/Bookings_model');
const mongoose = require('mongoose');
const moment = require('moment');
const { redis, isRedisConnected } = require("../config/Redis_Connect");

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

function toObjectId(id) {
  if (!id) return null;
  try {
    return mongoose.Types.ObjectId.createFromHexString(id);
  } catch {
    return null;
  }
}

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

    const cacheKey = `cars:${JSON.stringify(req.query)}`;

    if (isRedisConnected()) {
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          return res.status(200).json(JSON.parse(cachedData));
        }
      } catch (cacheErr) {
        console.warn("⚠️ Redis cache read failed, skipping cache:", cacheErr.message);
      }
    }

    const filter = {};
    const pickupObjId = toObjectId(pickupLocationId);
    const dropoffObjId = toObjectId(dropoffLocationId);

    if (pickupObjId || dropoffObjId) {
      filter.locationIds = { $in: [] };
      if (pickupObjId) filter.locationIds.$in.push(pickupObjId);
      if (dropoffObjId) filter.locationIds.$in.push(dropoffObjId);
    }

    if (category) filter.category = category.toUpperCase();
    if (gearBoxType) filter.gearBoxType = gearBoxType.toUpperCase();
    if (fuelType) filter.fuelType = fuelType.toUpperCase();

    if (minPrice || maxPrice) {
      filter.pricePerDay = {};
      if (minPrice) filter.pricePerDay.$gte = Number(minPrice);
      if (maxPrice) filter.pricePerDay.$lte = Number(maxPrice);
    }

    const pageNum = Math.max(parseInt(page, 10), 1);
    const pageSize = Math.max(parseInt(size, 10), 1);

    const totalElements = await Car.countDocuments(filter);
    const totalPages = Math.ceil(totalElements / pageSize);

    const cars = await Car.find(filter)
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .populate("locationIds");

    const parsedPickup = pickupDateTime ? parseISO(pickupDateTime) : startOfDay(new Date());
    const parsedDropoff = dropOffDateTime ? parseISO(dropOffDateTime) : endOfDay(new Date());

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

    const response = {
      content: responseContent,
      currentPage: pageNum,
      totalElements,
      totalPages,
    };

    if (isRedisConnected()) {
      try {
        await redis.setex(cacheKey, 300, JSON.stringify(response));
      } catch (cacheErr) {
        console.warn("⚠️ Redis cache write failed, continuing without cache:", cacheErr.message);
      }
    }

    res.status(200).json(response);
  } catch (err) {
    res.status(500).json({ message: "Unable to get cars", error: err.message });
  }
};

// ✅ Get car by ID
exports.getCarById = async (req, res) => {
  try {
    const { carId } = req.params;

    const cacheKey = `car:${carId}`;
    const carListKey = `car:cache:list`;

    if (isRedisConnected()) {
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          return res.status(200).json(JSON.parse(cachedData));
        }
      } catch (cacheErr) {
        console.warn("⚠️ Redis read failed:", cacheErr.message);
      }
    }

    const car = await Car.findById(carId);

    if (!car) return res.status(404).json({ message: 'Car not found' });

    const parsedPickup = startOfDay(new Date());
    const parsedDropoff = endOfDay(new Date());
    const status = await checkAvailability(car._id, parsedPickup, parsedDropoff);

    const firstLocation = car.locationIds[0];
    const locationText = firstLocation
      ? `${firstLocation.locationName}, ${firstLocation.locationAddress}`
      : 'Unknown';

    const response = {
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
    };

    if (isRedisConnected()) {
      try {
        await redis.setex(cacheKey, 3600, JSON.stringify(response));
        await redis.lpush(carListKey, carId);
        await redis.lrem(carListKey, -1, carId);
        const listSize = await redis.llen(carListKey);
        if (listSize > 5) {
          const oldestCarId = await redis.rpop(carListKey);
          if (oldestCarId) {
            await redis.del(`car:${oldestCarId}`);
          }
        }
      } catch (cacheErr) {
        console.warn("⚠️ Redis write failed:", cacheErr.message);
      }
    }

    return res.status(200).json(response);

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
    const cacheKey = "popularCars";
    if (isRedisConnected()) {
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          return res.status(200).json(JSON.parse(cachedData));
        }
      } catch (cacheErr) {
        console.warn("⚠️ Redis cache read failed, skipping cache:", cacheErr.message);
      }
    }

    const bookingsAgg = await Booking.aggregate([
      { $match: { status: { $ne: "CANCELED" } } },
      { $group: { _id: "$carId", bookingCount: { $sum: 1 } } },
      { $sort: { bookingCount: -1 } },
      { $limit: 3 },
    ]);

    const carIds = bookingsAgg.map(b => b._id);
    const cars = await Car.find({ _id: { $in: carIds } }).populate("locationIds");

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const content = await Promise.all(
      cars.map(async (car) => {
        const status = await checkAvailability(car._id, todayStart, todayEnd);
        const firstLocation = car.locationIds?.[0];
        const locationText = firstLocation
          ? `${firstLocation.locationName}, ${firstLocation.locationAddress}`
          : "Unknown";

        return {
          carId: car._id,
          model: car.model,
          imageUrl: car.images?.[0] || "",
          pricePerDay: car.pricePerDay,
          carRating: car.carRating?.toFixed(1) || "0.0",
          serviceRating: car.serviceRating?.toFixed(1) || "0.0",
          location: locationText,
          status,
        };
      })
    );

    const response = { content };

    if (isRedisConnected()) {
      try {
        await redis.setex(cacheKey, 300, JSON.stringify(response));
      } catch (cacheErr) {
        console.warn("⚠️ Redis cache write failed, continuing without cache:", cacheErr.message);
      }
    }

    res.status(200).json(response);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch popular cars.", error: err.message });
  }
};