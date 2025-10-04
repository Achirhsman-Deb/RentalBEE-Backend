const User = require('../Models/Users_model');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cloudinary = require("../config/cloudinary_config");
const fs = require("fs");
const { File } = require('megajs');
const initMega = require('../config/Mega_config');

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id; // comes from auth middleware

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect current password. Please try again.' });
    }

    // Password validation
    const pwdErrors = [];
    if (/\s/.test(newPassword)) pwdErrors.push("Password should not contain spaces");
    if (!/[A-Z]/.test(newPassword)) pwdErrors.push("Password should contain an uppercase letter");
    if (!/[0-9]/.test(newPassword)) pwdErrors.push("Password should contain a number");
    if (!/[!@#$%^&*]/.test(newPassword)) pwdErrors.push("Password should contain a special character");
    if (newPassword.length < 8) pwdErrors.push("Password should be at least 8 characters long");
    if (newPassword.length > 100) pwdErrors.push("Password is too long");

    if (pwdErrors.length > 0) {
      return res.status(400).json({ error: pwdErrors.join(" | ") });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    // Generate new JWT
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return res.status(200).json({
      message: 'Password changed successfully.',
      role: user.role,
      username: user.firstName + " " + user.lastName,
      userId: user._id,
      userImageUrl: user.imageUrl,
    });
  } catch (error) {
    console.error('Error changing password:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


/**
 * Get personal info
 */
exports.getPersonalInfo = async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

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

    if(changed){
      await user.save();
    }

    // If both verified → overall status VERIFIED
    if (
      user.aadhaarCard.status === "VERIFIED" &&
      user.drivingLicense.status === "VERIFIED"
    ) {
      overallStatus = "VERIFIED";
    }

    

    const response = {
      city: user.address.city,
      clientId: userId,
      country: user.address.country,
      email: user.email,
      firstName: user.firstName,
      imageUrl: user.imageUrl,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      postalCode: user.address.postalCode,
      street: user.address.street,
      status: overallStatus
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error getting personal info:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


/**
 * Update personal info
 */
exports.updatePersonalInfo = async (req, res) => {
  try {
    const { userId } = req.params;
    const { fields, files } = req;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // helper to safely extract first value
    const getField = (field) => (Array.isArray(field) ? field[0] : field);

    // update text fields
    user.firstName = getField(fields.firstName) || user.firstName;
    user.lastName = getField(fields.lastName) || user.lastName;
    user.email = getField(fields.email) || user.email;
    user.phoneNumber = getField(fields.phoneNumber) || user.phoneNumber;
    user.address.city = getField(fields.city) || user.address.city;
    user.address.country = getField(fields.country) || user.address.country;
    user.address.postalCode = getField(fields.postalCode) || user.address.postalCode;
    user.address.street = getField(fields.street) || user.address.street;

    // handle image upload
    if (files?.imageUrl) {
      const imageFile = Array.isArray(files.imageUrl)
        ? files.imageUrl[0]
        : files.imageUrl;

      if (!imageFile.path) {
        return res.status(400).json({ error: "No file path found in uploaded image" });
      }

      try {
        const uploadResult = await cloudinary.uploader.upload(imageFile.path, {
          folder: "UserProfilePicture",
          resource_type: "image",
        });
        user.imageUrl = uploadResult.secure_url;
      } catch (uploadErr) {
        console.error("Cloudinary upload error:", uploadErr);
        return res.status(500).json({ error: "Image upload failed" });
      }
    }

    const updatedUser = await user.save();

    return res.status(200).json({
      clientId: userId,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      phoneNumber: updatedUser.phoneNumber,
      street: updatedUser.address.street,
      city: updatedUser.address.city,
      country: updatedUser.address.country,
      postalCode: updatedUser.address.postalCode,
      imageUrl: updatedUser.imageUrl,
    });
  } catch (error) {
    console.error("Error updating personal info:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

//Add documents
exports.uploadDocuments = async (req, res) => {
  try {
    const { userId, docType } = req.params;

    const megaStorage = await initMega();

    // validate document type
    if (!["aadhaarCard", "drivingLicense"].includes(docType)) {
      return res.status(400).json({ error: "Invalid document type" });
    }

    // get uploaded file
    const file = req.files?.document;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // --- if user already has a document, delete it from Mega ---
    if (user[docType]?.nodeHandle) {
      const oldNode = megaStorage.files[user[docType].nodeHandle];

      if (oldNode) {
        await new Promise((resolve, reject) => {
          oldNode.delete((err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      }
    }

    // --- upload new document into "UserDocs" folder ---
    // find/create UserDocs folder in Mega
    let userDocsFolder = megaStorage.root.children.find(
      (f) => f.name === "UserDocs" && f.directory
    );

    if (!userDocsFolder) {
      userDocsFolder = await new Promise((resolve, reject) => {
        megaStorage.mkdir("UserDocs", (err, folder) => {
          if (err) return reject(err);
          resolve(folder);
        });
      });
    }

    // upload file
    const fileStream = fs.createReadStream(file.path);
    const fileNode = await new Promise((resolve, reject) => {
      megaStorage.upload(
        {
          name: `${userId}_${docType}_${Date.now()}_${file.name}`, // unique name
          size: file.size,
          allowUploadBuffering: true,
          target: userDocsFolder,
        },
        fileStream,
        (err, uploadedNode) => {
          if (err) return reject(err);
          resolve(uploadedNode);
        }
      );
    });

    const link = await new Promise((resolve, reject) => {
      fileNode.link((err, url) => {
        if (err) return reject(err);
        resolve(url);
      });
    });

    // update user document
    user[docType] = {
      documentUrl: link,
      nodeHandle: fileNode.nodeId || fileNode.handle,
      status: "UNVERIFIED",
    };

    await user.save();

    res.status(200).json({
      message: `${docType} uploaded successfully`,
      url: link,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

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

exports.getUserDocuments = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select("aadhaarCard drivingLicense");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const formatDoc = async (doc) => {
      if (!doc || !doc.documentUrl) {
        return { documentUrl: null, status: "UNVERIFIED", fileName: null, fileSize: null };
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

    // ✅ Await both promises
    const [aadhaarCard, drivingLicense] = await Promise.all([
      formatDoc(user.aadhaarCard),
      formatDoc(user.drivingLicense),
    ]);

    res.status(200).json({
      aadhaarCard,
      drivingLicense,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
};