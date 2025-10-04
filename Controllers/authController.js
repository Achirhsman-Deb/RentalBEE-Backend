const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../Models/Users_model");
const EmailVerification = require("../Models/EmailVarification_Model");
const { createAndSendNotification, sendMail } = require("../config/SendGrid_Config");
const axios = require("axios");

const isLatin = (str) => /^[A-Za-z\s]+$/.test(str.trim());
const emailRegex = /^[a-zA-Z0-9_%+-]+(\.[a-zA-Z0-9_%+-]+)*@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/;

const validateUserData = (data) => {
  const errors = {};
  const { firstName = "", lastName = "", email = "", password = "" } = data;

  if (!firstName.trim()) {
    errors.firstName = "First name is required";
  } else {
    if (firstName.length < 2 || firstName.length > 50) {
      errors.firstName = "Must be between 2 and 50 characters";
    } else if (!isLatin(firstName)) {
      errors.firstName = "Only Latin letters are allowed";
    } else if (/\s{2,}/.test(firstName)) {
      errors.firstName = "First name cannot have multiple spaces together";
    }
  }

  if (lastName) {
    if (!isLatin(lastName) || lastName.length > 50) {
      errors.lastName = "Must be between 2 and 50 characters";
    } else if (/\s{2,}/.test(lastName)) {
      errors.lastName = "Last name cannot have multiple spaces together";
    }
  }

  if (!email.trim()) {
    errors.email = "Email is required";
  } else if (!emailRegex.test(email)) {
    errors.email = "Invalid email format";
  } else if (email.length > 100) {
    errors.email = "Email is too long";
  }

  if (!password) {
    errors.password = "Password is required";
  } else {
    const pwdErrors = [];
    if (/\s/.test(password)) pwdErrors.push("Password should not contain spaces");
    if (!/[A-Z]/.test(password)) pwdErrors.push("Password should contain an uppercase letter");
    if (!/[0-9]/.test(password)) pwdErrors.push("Password should contain a number");
    if (!/[!@#$%^&*]/.test(password)) pwdErrors.push("Password should contain a special character");
    if (password.length < 8) pwdErrors.push("Password should be at least 8 characters long");
    if (password.length > 100) pwdErrors.push("Password is too long");
    if (pwdErrors.length) errors.password = pwdErrors.join(" | ");
  }
  return errors;
};

const capitalize = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";

const capitalizeWords = (str) =>
  str
    .split(" ")
    .map((word) => capitalize(word))
    .join(" ");

const signToken = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || "7d",
  });

// SERVICE: register
exports.registerUserService = async (userData) => {
  const errors = validateUserData(userData);
  if (Object.keys(errors).length > 0) {
    const error = new Error("Validation failed");
    error.statusCode = 400;
    error.details = errors;
    throw error;
  }

  const { firstName, email, password, lastName = "", otp } = userData;
  const lowerEmail = email.trim().toLowerCase();

  const existingUser = await User.findOne({ email: lowerEmail });
  if (existingUser) {
    const error = new Error("Email already registered");
    error.statusCode = 409;
    error.details = { email: "Email is already registered" };
    throw error;
  }

  // check OTP validity
  const record = await EmailVerification.findOne({ email: lowerEmail });
  if (!record || record.otp !== otp || record.expiresAt < Date.now()) {
    if (record && record.expiresAt < Date.now()) {
      await EmailVerification.deleteOne({ email: lowerEmail });
    }

    const error = new Error("OTP is Invalid or expired");
    error.statusCode = 400;
    error.details = { email: "OTP is Invalid or expired" };
    throw error;
  }

  // remove OTP record after success
  await EmailVerification.deleteOne({ email: lowerEmail });

  const passwordHash = await bcrypt.hash(password, 12);

  const newUser = await User.create({
    email: lowerEmail,
    firstName: capitalizeWords(firstName.trim()),
    lastName: capitalize(lastName.trim()),
    passwordHash,
  });

  // if you’re using Cognito or some external ID, set it here
  const cognitoUserId = newUser._id.toString(); // placeholder, replace with actual Cognito ID if needed

  return {
    message: "User registered successfully",
    userId: newUser._id,
    cognitoId: cognitoUserId,
  };
};

// CONTROLLER: register
exports.registerController = async (req, res, next) => {
  try {
    const result = await exports.registerUserService(req.body);

    // Auto-send welcome + reminder notification
    (async () => {
      try {
        await createAndSendNotification({
          userId: result.userId,
          title: "Welcome to RentalBEE 🎉",
          message:
            "Thanks for joining the RentalBEE community! Please verify your documents before you start renting.",
          type: "info",
        });
      } catch (notifyErr) {
        console.error(
          `Failed to create notification for user ${result.userId}:`,
          notifyErr
        );
      }
    })();

    res.status(201).json(result);
  } catch (err) {
    res.status(err.statusCode).json({
      statusCode: err.statusCode,
      message: err.message,
      error: err.message,
    })
  }
};

// CONTROLLER: login
exports.loginController = async (req, res) => {
  try {
    const { email = "", password = "" } = req.body;

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) {
      return res.status(401).json({
        statusCode: 401,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email: trimmed }).select("+passwordHash");
    if (!user) {
      return res.status(401).json({
        statusCode: 401,
        message: "Invalid credentials",
      });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({
        statusCode: 401,
        message: "Invalid credentials",
      });
    }

    const token = signToken(user._id.toString());
    let overallStatus = "UNVERIFIED";
    let changed = false;

    // Aadhaar check
    if (!user.aadhaarCard.documentUrl || user.aadhaarCard.documentUrl === "") {
      changed = true
      user.aadhaarCard.status = "UNVERIFIED";
    }

    // Driving License check
    if (!user.drivingLicense.documentUrl || user.drivingLicense.documentUrl === "") {
      changed = true
      user.drivingLicense.status = "UNVERIFIED";
    }

    if (changed) {
      await user.save();
    }

    // If both verified → overall status VERIFIED
    if (
      user.aadhaarCard.status === "VERIFIED" &&
      user.drivingLicense.status === "VERIFIED"
    ) {
      overallStatus = "VERIFIED";
    }

    return res.status(200).json({
      statusCode: 200,
      body: {
        idToken: token,
        role: user.role || "user",
        username: user.firstName + " " + (user.lastName || ""),
        userId: user._id,
        userImageUrl: user.imageUrl || null,
        status: overallStatus
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      error: err.message,
    });
  }
};

// CONTROLLER: logout (noop since no cookies)
exports.logoutController = async (req, res, next) => {
  try {
    res.json({ message: "Logged out (client should drop token)" });
  } catch (err) {
    next(err);
  }
};

async function verifyCaptcha(captchaToken) {
  const secretKey = process.env.CAPTCHA_KEY;

  const response = await axios.post(
    "https://www.google.com/recaptcha/api/siteverify",
    new URLSearchParams({
      secret: secretKey,
      response: captchaToken,
    })
  );

  return response.data;
}

exports.sendOtpController = async (req, res, next) => {
  try {
    const { email, captchaToken, type } = req.body;
    const lowerEmail = email.trim().toLowerCase();

    // Verify captcha
    const captchaRes = await verifyCaptcha(captchaToken);
    if (!captchaRes.success && type == "Registration") {
      return res.status(409).json({
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
      const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min

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

    //Check if user exists
    const user = await User.findOne({ email: lowerEmail });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    //Validate OTP
    const otpDoc = await EmailVerification.findOne({ email: lowerEmail });
    if (!otpDoc) {
      return res.status(400).json({ error: "OTP not found or expired" });
    }

    if (otpDoc.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (otpDoc.expiresAt < Date.now()) {
      await EmailVerification.deleteOne({ email: lowerEmail });
      return res.status(400).json({ error: "OTP expired" });
    }

    //Update password & delete OTP
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();
    await EmailVerification.deleteOne({ email: lowerEmail });

    //Send password change warning
    await sendMail({
      to: lowerEmail,
      subject: "Your RentalBEE password was changed",
      text: `Hello, your password was successfully changed. If you did not perform this action, please contact support immediately.`,
      html: `<p>Hello ${user.firstName},</p>
             <p>Your <b>RentalBEE</b> account password was successfully changed.</p>
             <p>If this wasn't you, please <a href="mailto:support@rentalbee.com">contact support</a> immediately.</p>`,
    });

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Forgot Password Error:", err);
    return res.status(500).json({
      statusCode: 500,
      message: "Internal server error",
      error: err.message,
    });
  }
};