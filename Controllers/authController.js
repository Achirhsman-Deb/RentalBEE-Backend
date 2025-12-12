const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../Models/Users_model");
const EmailVerification = require("../Models/EmailVarification_Model");
const RefreshToken = require("../Models/RefreshToken_model");
const { createAndSendNotification, sendMail } = require("../config/SendGrid_Config");
const axios = require("axios");
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');

// --- VALIDATION HELPERS (Same as before) ---
const isLatin = (str) => /^[A-Za-z\s]+$/.test(str.trim());
const emailRegex = /^[a-zA-Z0-9_%+-]+(\.[a-zA-Z0-9_%+-]+)*@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/;
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const validateUserData = (data) => {
  const errors = {};
  const { firstName = "", lastName = "", email = "", password = "" } = data;
  // ... (Paste your existing validation logic here to save space) ...
  // Keep the exact validation logic you gave me earlier
  if (!firstName.trim()) errors.firstName = "First name is required";
  // etc...
  return errors;
};

const capitalize = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
const capitalizeWords = (str) => str.split(" ").map((word) => capitalize(word)).join(" ");


// --- TOKEN HELPERS ---

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { sub: userId },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "6h" }
  );

  // Refresh Token: Long lived (7 days)
  const refreshToken = jwt.sign(
    { sub: userId },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "14d" }
  );

  return { accessToken, refreshToken };
};

const sendCookies = (res, accessToken, refreshToken) => {
  const isProd = process.env.NODE_ENV === "production";

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "None" : "Lax",
    maxAge: 15 * 60 * 1000, // 15 mins
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "None" : "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// --- CONTROLLERS ---

exports.registerUserService = async (userData) => {
  // ... (Keep your existing register logic exactly as is) ...
  const errors = validateUserData(userData);
  if (Object.keys(errors).length > 0) {
    const e = new Error("Validation failed"); e.statusCode = 400; throw e;
  }
  const { firstName, email, password, lastName = "", otp } = userData;
  const lowerEmail = email.trim().toLowerCase();

  // Check User Exists
  if (await User.findOne({ email: lowerEmail })) {
    const e = new Error("Email already registered"); e.statusCode = 409; throw e;
  }

  // Check OTP
  const record = await EmailVerification.findOne({ email: lowerEmail });
  if (!record || record.otp !== otp || record.expiresAt < Date.now()) {
    if (record && record.expiresAt < Date.now()) await EmailVerification.deleteOne({ email: lowerEmail });
    const e = new Error("OTP is Invalid or expired"); e.statusCode = 400; throw e;
  }
  await EmailVerification.deleteOne({ email: lowerEmail });

  const passwordHash = await bcrypt.hash(password, 12);
  const newUser = await User.create({
    email: lowerEmail,
    firstName: capitalizeWords(firstName.trim()),
    lastName: capitalize(lastName.trim()),
    passwordHash,
  });

  return { message: "User registered successfully", userId: newUser._id };
};

exports.registerController = async (req, res) => {
  try {
    const result = await exports.registerUserService(req.body);

    // Auto-Login Logic
    const { accessToken, refreshToken } = generateTokens(result.userId.toString());

    // Save Refresh Token to MongoDB
    await RefreshToken.create({ userId: result.userId, token: refreshToken });

    // Set Cookies
    sendCookies(res, accessToken, refreshToken);

    // Notification
    (async () => {
      try {
        await createAndSendNotification({
          userId: result.userId, title: "Welcome to RentalBEE 🎉", message: "Welcome!", type: "info"
        });
      } catch (e) { console.error(e); }
    })();

    res.status(201).json({ message: result.message, userId: result.userId, isAuthenticated: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

exports.loginController = async (req, res) => {
  try {
    const { email = "", password = "" } = req.body;
    const trimmed = email.trim().toLowerCase();

    if (!trimmed || !password) return res.status(401).json({ message: "Credentials required" });

    const user = await User.findOne({ email: trimmed }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const { accessToken, refreshToken } = generateTokens(user._id.toString());

    await RefreshToken.create({ userId: user._id, token: refreshToken });

    sendCookies(res, accessToken, refreshToken);

    let overallStatus = "UNVERIFIED";
    let changed = false;
    if (!user.aadhaarCard?.documentUrl) { changed = true; user.aadhaarCard.status = "UNVERIFIED"; }
    if (!user.drivingLicense?.documentUrl) { changed = true; user.drivingLicense.status = "UNVERIFIED"; }
    if (changed) await user.save();
    if (user.aadhaarCard?.status === "VERIFIED" && user.drivingLicense?.status === "VERIFIED") overallStatus = "VERIFIED";

    return res.status(200).json({
      statusCode: 200,
      body: {
        role: user.role || "user",
        userId: user._id.toString(),
        username: user.firstName + " " + (user.lastName || ""),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        country: user.country,
        city: user.city,
        street: user.street,
        postalCode: user.postalCode,
        imageUrl: user.imageUrl || null,
        status: overallStatus
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.logoutController = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    // Remove from MongoDB
    if (refreshToken) {
      await RefreshToken.deleteOne({ token: refreshToken });
    }

    // Clear Cookies
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};

exports.refreshTokenController = async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken;

  if (!incomingRefreshToken) {
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    return res.status(401).json({ message: "Not authenticated" });
  }

  // Clear cookies before proceeding (we will set new ones if successful)
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");

  let decoded;
  try {
    // 1. Verify Signature using the CORRECT REFRESH_TOKEN_SECRET
    decoded = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch (err) {
    // If signature fails (expired, tampered, or wrong secret used), 403
    console.error("JWT Verification failed during refresh:", err.message);
    // Attempt to clean up a potentially bad token in the DB
    await RefreshToken.deleteOne({ token: incomingRefreshToken });
    return res.status(403).json({ message: "Invalid refresh token signature" });
  }

  try {
    // 2. Check MongoDB for this exact token
    const storedToken = await RefreshToken.findOne({ token: incomingRefreshToken });

    // 3. SECURITY: Reuse Detection (Token valid, but not in DB)
    if (!storedToken) {
      console.log(`[Security] Token reuse detected for user ${decoded.sub}. Invalidating all sessions.`);
      // Invalidate all tokens for this user as a security measure
      await RefreshToken.deleteMany({ userId: decoded.sub });
      return res.status(403).json({ message: "Security violation. Please login again." });
    }

    // 4. Token Rotation: Delete the used token
    await RefreshToken.deleteOne({ _id: storedToken._id });

    // 5. Generate NEW tokens
    const tokens = generateTokens(decoded.sub);

    // 6. Save NEW refresh token to DB
    await RefreshToken.create({ userId: decoded.sub, token: tokens.refreshToken });

    // 7. Send NEW cookies
    sendCookies(res, tokens.accessToken, tokens.refreshToken);

    // 8. Respond with success
    return res.status(200).json({ message: "Tokens refreshed successfully" });

  } catch (err) {
    console.error("Refresh Logic Error:", err);
    // Generic error if database operation fails
    return res.status(500).json({ message: "Internal server error during refresh" });
  }
};

async function verifyCaptcha(captchaToken) {
  const secretKey = process.env.CAPTCHA_KEY;
  const formData = new URLSearchParams();
  formData.append('secret', secretKey);
  formData.append('response', captchaToken);

  try {
    const response = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      formData,
      { headers: {'Content-Type': 'application/x-www-form-urlencoded' }}
    );

    return response.data;
  } catch (error) {
    console.error("reCAPTCHA API Error:", error.message);
    return { success: false, "error-codes": ["internal-api-error"] };
  }
}

exports.sendOtpController = async (req, res, next) => {
  try {
    const { email, captchaToken, type } = req.body;
    const lowerEmail = email.trim().toLowerCase();
    console.log("SendGrid Key:", process.env.SENDGRID_API_KEY);

    // Verify captcha
    const captchaRes = await verifyCaptcha(captchaToken);
    if (!captchaRes.success && type == "Registration") {
      console.log("Captcha Verification Response:", captchaRes);
      return res.status(400).json({
        error: "Captcha verification failed",
        details: captchaRes["error-codes"],
      });
    }

    // Check if already registered
    const existingUser = await User.findOne({ email: lowerEmail });
    if (existingUser && type == "Registration") {
      return res.status(409).json({ error: "Email already registered" });
    }
    if (!existingUser && type == "ForgotPassword") {
      return res.status(409).json({ error: "Invalid Email or user dosen't exist" });
    }

    // Check if OTP already exists and hasn't expired
    const existingOtpDoc = await EmailVerification.findOne({ email: lowerEmail });
    if (existingOtpDoc && existingOtpDoc.expiresAt > Date.now()) {
      return res.status(200).json({
        message: "OTP already sent, still valid",
      });
    } else {
      // Generate new OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 15 * 60 * 1000;

      // Upsert OTP doc
      await EmailVerification.findOneAndUpdate(
        { email: lowerEmail },
        { otp, expiresAt },
        { upsert: true, new: true }
      );

      // Send mail
      const subject = type === "Registration" ? "Verify your RentalBEE account" : "Reset your RentalBEE password";

      await sendMail({
        to: lowerEmail,
        subject,
        text: `Your OTP is ${otp}. It expires in 15 minutes.`,
        html: `<p>Your OTP is <b>${otp}</b>. It expires in 15 minutes.</p>`,
      });

      return res.status(200).json({ message: "OTP sent successfully" });
    }
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      error: err.message,
    });
  }
};

exports.forgotPasswordController = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const lowerEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: lowerEmail });
    if (!user) return res.status(404).json({ error: "User not found" });

    const otpDoc = await EmailVerification.findOne({ email: lowerEmail });
    if (!otpDoc) return res.status(400).json({ error: "OTP not found or expired" });
    if (otpDoc.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
    if (otpDoc.expiresAt < Date.now()) {
      await EmailVerification.deleteOne({ email: lowerEmail });
      return res.status(400).json({ error: "OTP expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();
    await EmailVerification.deleteOne({ email: lowerEmail });

    await sendMail({
      to: lowerEmail,
      subject: "Your RentalBEE password was changed",
      text: `Hello, your password was successfully changed.`,
      html: `<p>Hello ${user.firstName},</p><p>Your <b>RentalBEE</b> account password was successfully changed.</p>`,
    });

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Forgot Password Error:", err);
    return res.status(500).json({ statusCode: 500, message: "Internal server error", error: err.message });
  }
};

exports.googleAuthController = async (req, res) => {
  try {
    const { credential } = req.body; 

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    
    const email = payload.email;
    const googleId = payload.sub;
    const firstName = payload.given_name || "User";
    const lastName = payload.family_name || "";
    const picture = payload.picture;

    let user = await User.findOne({ email: email }).select("+passwordHash");

    if (!user) {
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      user = await User.create({
        email: email,
        firstName: capitalizeWords(firstName),
        lastName: capitalize(lastName),
        passwordHash,
        imageUrl: picture,
        isGoogleAuth: true,
        aadhaarCard: { status: "UNVERIFIED" },
        drivingLicense: { status: "UNVERIFIED" }
      });

      (async () => {
        try {
            await createAndSendNotification({
              userId: user._id, title: "Welcome to RentalBEE 🎉", message: "Welcome via Google!", type: "info"
            });
        } catch (e) { console.error(e); }
      })();
    }

    const { accessToken, refreshToken } = generateTokens(user._id.toString());

    await RefreshToken.create({ userId: user._id, token: refreshToken });

    sendCookies(res, accessToken, refreshToken);
    let overallStatus = "UNVERIFIED";
    let changed = false;

    if (!user.aadhaarCard) { user.aadhaarCard = { status: "UNVERIFIED" }; changed = true; }
    if (!user.drivingLicense) { user.drivingLicense = { status: "UNVERIFIED" }; changed = true; }
    if (!user.aadhaarCard.documentUrl) { changed = true; user.aadhaarCard.status = "UNVERIFIED"; }
    if (!user.drivingLicense.documentUrl) { changed = true; user.drivingLicense.status = "UNVERIFIED"; }
    
    if (changed) await user.save();
    
    if (user.aadhaarCard?.status === "VERIFIED" && user.drivingLicense?.status === "VERIFIED") {
        overallStatus = "VERIFIED";
    }
    return res.status(200).json({
      statusCode: 200,
      body: {
        role: user.role || "user",
        userId: user._id.toString(),
        username: user.firstName + " " + (user.lastName || ""),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        country: user.country,
        city: user.city,
        street: user.street,
        postalCode: user.postalCode,
        imageUrl: user.imageUrl || picture,
        status: overallStatus
      },
    });

  } catch (err) {
    console.error("Google Auth Error:", err);
    return res.status(401).json({ message: "Google authentication failed" });
  }
};