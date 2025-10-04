const sgMail = require('@sendgrid/mail');
const Notification = require("../Models/Notification_model");
const User = require("../Models/Users_model");

const {
  SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL,
  SENDGRID_FROM_NAME
} = process.env;

if (!SENDGRID_API_KEY) {
  throw new Error('SENDGRID_API_KEY is not set in environment');
}
if (!SENDGRID_FROM_EMAIL) {
  throw new Error('SENDGRID_FROM_EMAIL is not set in environment');
}

sgMail.setApiKey(SENDGRID_API_KEY);

async function sendMail({ to, subject, text, html, templateId, dynamicTemplateData }) {
  const from = SENDGRID_FROM_NAME
    ? { name: SENDGRID_FROM_NAME, email: SENDGRID_FROM_EMAIL }
    : SENDGRID_FROM_EMAIL;

  const msg = {
    to,
    from,
    ...(subject ? { subject } : {}),
    ...(templateId ? { templateId } : {}),
    ...(dynamicTemplateData ? { dynamicTemplateData } : {}),
    ...(html ? { html } : {}),
    ...(text ? { text } : {})
  };

  return sgMail.send(msg);
}

const createAndSendNotification = async ({ userId, title, message, type }) => {
  // 1. Create notification in DB
  const notification = new Notification({
    userId,
    title,
    message,
    type,
  });
  await notification.save();

  // 2. Send email if user exists
  const user = await User.findById(userId).select("email firstName lastName");

  if (user && user.email) {
    sendMail({
      to: user.email,
      subject: `${title} — RentalBEE`,
      templateId: process.env.SENDGRID_TEMPLATE_NEW_NOTIFICATION,
      dynamicTemplateData: {
        userName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Customer",
        title,
        message,
        appName: "RentalBEE",
      },
    }).catch(err => {
      console.error("Failed to send notification email:", err);
    });
  }

  return notification;
};


module.exports = { sendMail,createAndSendNotification };