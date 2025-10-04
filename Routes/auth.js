const express = require("express");
const { registerController, loginController, logoutController, sendOtpController, forgotPasswordController } = require("../Controllers/authController");
const { authMiddleware } = require("../Middlewares/auth");
const router = express.Router();

router.post("/sign-up", registerController);
router.post("/send-otp", sendOtpController);
router.post("/sign-in", loginController);
router.post("/forgot-pass", forgotPasswordController);
router.post("/logout", authMiddleware, logoutController);

module.exports = router;
