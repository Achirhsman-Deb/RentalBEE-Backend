const express = require("express");
require("dotenv").config();
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { connectToDatabase } = require("./config/Mongo_Connect");

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors({ origin: "https://rental-bee-frontend.vercel.app",credentials: true, allowedHeaders: "Content-Type,Authorization" }));

// Middleware
app.use(helmet());
app.use(cookieParser());
app.use(express.json());

// Connect to MongoDB once at startup
connectToDatabase()
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => {
        console.error("Failed to connect to MongoDB:", err.message);
        process.exit(1);
    });

// Routes
app.use("/auth", require("./Routes/auth"));
app.use("/home", require("./Routes/home"));
app.use("/cars", require("./Routes/cars"));
app.use("/bookings", require("./Routes/bookings"));
app.use("/feedbacks", require("./Routes/feedbacks"));
app.use("/reports", require("./Routes/reports"));
app.use("/user", require("./Routes/users"));
app.use("/notifications", require("./Routes/notifications"));
app.use("/support", require("./Routes/Support"));

// Default route
app.get("/", (req, res) => {
    res.status(200).json({ message: "Hello" });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error("Error:", err.message);
    res.status(err.statusCode || 500).json({ message: err.message || "Internal Server Error" });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});