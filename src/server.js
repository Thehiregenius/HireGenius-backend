const express = require('express');
const cors = require('cors');
const db = require('./config/db'); // if you have one
const authRoutes = require('./routes/auth');

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // parses JSON request body
app.use(express.urlencoded({ extended: true })); 

// Routes
app.use("/", authRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("Server is running!");
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
