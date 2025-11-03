const express = require("express");
const router = express.Router();
const { getProfile, updateProfile } = require("../controller/profileController");
const { jwtAuthMiddleware } = require("../config/jwt"); // your auth check

// Profile routes
router.get("/profile", jwtAuthMiddleware, getProfile);
router.patch("/profile", jwtAuthMiddleware, updateProfile);

module.exports = router;