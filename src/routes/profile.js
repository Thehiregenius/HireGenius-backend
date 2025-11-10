const express = require("express");
const router = express.Router();
const { getProfile, updateProfile } = require("../controller/profileController");
const { jwtAuthMiddleware } = require("../config/jwt"); // your auth check
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ensure uploads directory exists
const uploadDir = path.resolve(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// disk storage with unique filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const clean = file.originalname.replace(/\s+/g, "-");
    cb(null, `${unique}-${clean}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // e.g. 5 MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG/JPEG images are allowed"));
  }
});

// Profile routes
router.get("/profile", jwtAuthMiddleware, getProfile);
router.patch("/profile", jwtAuthMiddleware, upload.single("avatar"), updateProfile);

module.exports = router;