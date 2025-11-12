// backend/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const { signup, login, googleSignup, googleLogin, verifyOtp, logout } = require("../controller/authController");

// Email/password routes
router.post("/signup", signup);
router.post("/verify-otp", verifyOtp);
router.post("/login", login);

// Google OAuth routes
router.post("/google-signup", googleSignup);
router.post("/google-login", googleLogin);

// Logout
router.post("/logout", logout);

module.exports = router;
