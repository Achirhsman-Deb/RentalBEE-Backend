const { sendMail } = require("../config/SendGrid_Config");
const Notification = require("../Models/Notification_model");
const User = require('../Models/Users_model');

// Create a notification (backend event)
exports.createNotification = async (req, res) => {
    try {
        const { userId, title, message, type } = req.body;

        const notification = new Notification({
            userId,
            title,
            message,
            type
        });

        await notification.save();

        const user = await User.findById(userId).select('email firstName lastName');

        if (user && user.email) {
            sendMail({
                to: user.email,
                subject: `${title} — RentalBEE`,
                templateId: process.env.SENDGRID_TEMPLATE_NEW_NOTIFICATION,
                dynamicTemplateData: {
                    userName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Customer",
                    title,
                    message,
                    appName: "RentalBEE"
                }
            }).catch(err => {
                console.error("Failed to send notification email:", err);
            });
        }

        res.status(201).json({ success: true, notification });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get all notifications for logged-in user
exports.getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({
            userId: req.userId,
            isRead: false
        }).sort({ createdAt: -1 });

        res.status(200).json({ success: true, notifications });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Mark as read
exports.deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;

        const notification = await Notification.findByIdAndDelete(id);

        if (!notification) {
            return res.status(404).json({ success: false, error: "Notification not found" });
        }

        res.status(200).json({ success: true, message: "Notification deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Delete a notification
exports.deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;

        await Notification.findByIdAndDelete(id);

        res.status(200).json({ success: true, message: "Notification deleted" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};