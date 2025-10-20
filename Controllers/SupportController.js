const Booking = require('../Models/Bookings_model');
const User = require("../Models/Users_model");
const { File } = require("megajs");
const Car = require("../Models/Cars_model");
const { createAndSendNotification } = require('../config/SendGrid_Config');
const moment = require('moment');

const getFileInfo = async (fileUrl) => {
  return new Promise((resolve, reject) => {
    const file = File.fromURL(fileUrl);
    file.loadAttributes((err, attr) => {
      if (err) return reject(err);

      const parts = file.name.split("_");
      const originalName = parts.slice(3).join("_");

      resolve({
        fileName: originalName,
        fileSize: file.size
      });
    });
  });
};

exports.getAllBookingsLite = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const currentPage = Math.max(parseInt(page), 1);
    const perPage = Math.max(parseInt(limit), 1);

    const totalBookings = await Booking.countDocuments(filter);

    // Fetch minimal fields to reduce payload size
    const bookings = await Booking.find(filter)
      .populate("carId", "model category") // basic car info only
      .populate("clientId", "firstName lastName") // minimal client info
      .select("bookingDate status totalPrice createdAt cancelRequest") // select essential fields
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * perPage)
      .limit(perPage)
      .lean();

    const cars = await Car.find({}, "model _id").lean();

    const Cars = cars.map(car => ({
      id: car._id,
      name: car.model
    }));

    res.status(200).json({
      success: true,
      total: totalBookings,
      currentPage,
      totalPages: Math.ceil(totalBookings / perPage),
      bookings,
      Cars
    });
  } catch (error) {
    console.error("Error fetching bookings (lite):", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.getBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate("carId", "_id model images category engineCapacity fuelType gearBoxType passengerCapacity carRating pricePerDay")
      .populate("clientId", "firstName lastName email phoneNumber address")
      .populate("pickupLocationId", "locationName locationAddress")
      .populate("dropoffLocationId", "locationName locationAddress")
      .populate("pickupDateTime dropoffDateTime")
      .lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    res.status(200).json({
      success: true,
      booking,
    });
  } catch (error) {
    console.error("Error fetching booking details:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.reservationController = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;
    const supportUserId = req.user?._id; // assuming auth middleware attaches support user

    // 1. Validate inputs
    if (!bookingId || !status) {
      return res.status(400).json({
        success: false,
        message: "Booking ID and status are required",
      });
    }

    // 2. Validate allowed statuses
    const validStatuses = [
      "RESERVED",
      "SERVICESTARTED",
      "SERVICEPROVIDED",
      "CANCELED",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status provided",
      });
    }

    // 3. Find booking and populate car details
    const booking = await Booking.findById(bookingId).populate("carId", "model");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // 4. Handle cancel request tracking if status is "CANCELED"
    if (status === "CANCELED") {
      booking.cancelRequest.status = "APPROVED";
      booking.cancelRequest.reviewedAt = new Date();
      booking.cancelRequest.reviewedBy = supportUserId || null;

      // If user hadn’t already made a cancel request, fill the requestedAt timestamp
      if (!booking.cancelRequest.requestedAt) {
        booking.cancelRequest.requestedAt = new Date();
      }
    }

    // 5. Update booking status
    booking.status = status;
    await booking.save();

    // 6. Prepare notification content
    let title, message;

    if (status === "CANCELED") {
      title = `Your booking has been canceled`;
      message = `Your booking for ${booking.carId.model} from ${moment(
        booking.pickupDateTime
      ).format("MMM D")} to ${moment(booking.dropoffDateTime).format(
        "MMM D"
      )} has been successfully canceled by our support team.`;
    } else {
      title = `Reservation request ${status.toLowerCase()}`;
      message = `Your booking request for ${booking.carId.model} from ${moment(
        booking.pickupDateTime
      ).format("MMM D")} to ${moment(booking.dropoffDateTime).format(
        "MMM D"
      )} has been successfully ${status.toLowerCase()}.`;
    }

    // 7. Send notification asynchronously (non-blocking)
    (async () => {
      try {
        await createAndSendNotification({
          userId: booking.clientId,
          title,
          message,
          type: status === "CANCELED" ? "warning" : "info",
        });
      } catch (notifyErr) {
        console.error(
          `Failed to create notification for user ${booking.clientId}:`,
          notifyErr
        );
      }
    })();

    // 8. Respond to client
    return res.status(200).json({
      success: true,
      message: "Booking status updated successfully",
      booking,
    });
  } catch (error) {
    console.error("Error changing reservation status:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};






exports.getUsersWithDocuments = async (req, res) => {
  try {
    const { status = "ALL", page = 1, limit = 10 } = req.query;

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;

    // Build query based on status filter
    let query = {};

    if (status.toUpperCase() === "VERIFIED") {
      query.$and = [
        { "aadhaarCard.status": "VERIFIED" },
        { "drivingLicense.status": "VERIFIED" },
      ];
    } else if (status.toUpperCase() === "UNVERIFIED") {
      query.$or = [
        { "aadhaarCard.status": "UNVERIFIED" },
        { "drivingLicense.status": "UNVERIFIED" },
      ];
    }

    const users = await User.find(query)
      .select("firstName lastName email phoneNumber role aadhaarCard drivingLicense createdAt")
      .skip(skip)
      .limit(pageSize)
      .lean();

    const totalUsers = await User.countDocuments(query);

    const formattedUsers = users.map((user) => ({
      userId: user._id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phoneNumber: user.phoneNumber || "N/A",
      createdAt: user.createdAt,
      documents: {
        AadhaarCard: user.aadhaarCard?.status || "UNVERIFIED",
        DrivingLicense: user.drivingLicense?.status || "UNVERIFIED",
      },
    }));

    return res.status(200).json({
      success: true,
      message: `Fetched users with ${status.toUpperCase()} documents successfully`,
      currentPage: pageNumber,
      totalPages: Math.ceil(totalUsers / pageSize),
      totalUsers,
      count: formattedUsers.length,
      data: formattedUsers,
    });
  } catch (error) {
    console.error("Error fetching users with documents:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


exports.getUserDocumentsById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select("aadhaarCard drivingLicense");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Helper function to format MEGA document info
    const formatDoc = async (doc) => {
      if (!doc || !doc.documentUrl) {
        return {
          documentUrl: null,
          status: "UNVERIFIED",
          fileName: null,
          fileSize: null,
        };
      }

      let meta = { fileName: null, fileSize: null };
      try {
        meta = await getFileInfo(doc.documentUrl);
      } catch (err) {
        console.error("Error fetching MEGA metadata:", err);
      }

      return {
        documentUrl: doc.documentUrl,
        status: doc.status || "UNVERIFIED",
        fileName: meta.fileName,
        fileSize: meta.fileSize,
      };
    };

    // Fetch both Aadhaar & Driving License info concurrently
    const [aadhaarCard, drivingLicense] = await Promise.all([
      formatDoc(user.aadhaarCard),
      formatDoc(user.drivingLicense),
    ]);

    return res.status(200).json({
      success: true,
      message: "Fetched user documents successfully",
      data: {
        AadhaarCard: aadhaarCard,
        DrivingLicense: drivingLicense,
      },
    });
  } catch (error) {
    console.error("Error fetching user documents:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateDocumentStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { documentType, status } = req.body;

    // 1️⃣ Validate inputs
    if (!documentType || !["aadhaarCard", "drivingLicense"].includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document type. Use 'aadhaarCard' or 'drivingLicense'.",
      });
    }

    if (!status || !["VERIFIED", "UNVERIFIED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Use 'VERIFIED' or 'UNVERIFIED'.",
      });
    }

    // 2️⃣ Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 3️⃣ Update document status
    user[documentType].status = status;
    await user.save();

    // 4️⃣ Send notification asynchronously (non-blocking)
    (async () => {
      try {
        const readableDocType =
          documentType === "aadhaarCard" ? "Aadhaar Card" : "Driving License";

        let title, message, type;

        if (status === "VERIFIED") {
          title = `${readableDocType} Verified 🎉`;
          message = `Good news! Your ${readableDocType} has been successfully verified. You're now one step closer to smooth reservations and access to all features.`;
          type = "success";
        } else {
          title = `${readableDocType} Verification Failed ❌`;
          message = `We’re sorry! Your ${readableDocType} could not be verified. Please recheck your details and upload a clear, valid document to try again.`;
          type = "warning";
        }

        await createAndSendNotification({
          userId,
          title,
          message,
          type,
        });
      } catch (notifyErr) {
        console.error(`Failed to create notification for user ${userId}:`, notifyErr);
      }
    })();

    // 5️⃣ Response
    return res.status(200).json({
      success: true,
      message: `Successfully updated ${documentType} status to ${status} for user.`,
      data: {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        updatedDocument: documentType,
        newStatus: status,
        currentDocuments: {
          AadhaarCard: user.aadhaarCard?.status || "UNVERIFIED",
          DrivingLicense: user.drivingLicense?.status || "UNVERIFIED",
        },
      },
    });
  } catch (error) {
    console.error("Error updating document status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};