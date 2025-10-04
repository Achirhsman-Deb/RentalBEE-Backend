const express = require("express");
const {
  getAllCars,
  getCarById,
  getCarBookedDays,
  getClientReviewsByCarId,
  getPopularCars,
} = require("../Controllers/carsController");

const router = express.Router();

router.get("/", getAllCars); 
router.get("/popular", getPopularCars);
router.get("/:carId", getCarById);
router.get("/:carId/booked-days", getCarBookedDays);
router.get("/:carId/client-review", getClientReviewsByCarId);


module.exports = router;
