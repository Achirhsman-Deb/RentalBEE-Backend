const express = require("express");
const { registerController, loginController, logoutController, sendOtpController, forgotPasswordController, refreshTokenController, googleAuthController } = require("../Controllers/authController");
const { authMiddleware } = require("../Middlewares/auth");
const router = express.Router();

router.post("/sign-up", registerController);
router.post("/send-otp", sendOtpController);
router.post("/sign-in", loginController);
router.post("/forgot-pass", forgotPasswordController);
router.post("/logout", authMiddleware, logoutController);
router.post("/google", googleAuthController);

router.get("/refresh-token", refreshTokenController);

module.exports = router;
