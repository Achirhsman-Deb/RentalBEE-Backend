const express = require("express");
const router = express.Router();
const formidable = require('express-formidable');
const { changePassword, getPersonalInfo, updatePersonalInfo, uploadDocuments, getUserDocuments } = require("../Controllers/userController");
const { authMiddleware } = require("../Middlewares/auth");

const formidableOptions = {
    maxFileSize: 100 * 1024 * 1024,
    multiples: false,           
    keepExtensions: true              
};

// Change password
router.put("/change-password", authMiddleware, changePassword);

// Get personal info
router.get("/personal-info/:userId", getPersonalInfo);

// Update personal info
router.put("/personal-info/:userId", authMiddleware,formidable(formidableOptions), updatePersonalInfo);

// Upload Documents
router.put("/document/upload/:userId/:docType", authMiddleware,formidable(formidableOptions), uploadDocuments);

// Get user's Documents
router.get("/document/:userId", authMiddleware, getUserDocuments);

module.exports = router;
