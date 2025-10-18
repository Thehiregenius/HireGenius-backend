// import dotenv from "dotenv";
// dotenv.config();
require('dotenv').config();
const express = require('express');
const cors = require("cors");
const cookieParser = require("cookie-parser");
const db = require('./config/db'); // if you have one
const authRoutes = require('./routes/auth');
const crawlRoutes = require('./routes/crawl');


// Middleware
const app = express();

app.use(express.json());
app.use(cookieParser());

app.use(express.urlencoded({ extended: true })); 
app.use(
  cors({
    origin: "http://localhost:3000", // frontend origin (Next.js)
    credentials: true, // allow cookies to be sent
  })
);

// Routes
app.use("/", authRoutes);
app.use("/", crawlRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("Server is running!");
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
