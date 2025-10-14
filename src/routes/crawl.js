// backend/routes/crawlRoutes.js
const express = require("express");
const router = express.Router();
const { submitCrawlJob } = require("../controller/crawlController");
const { jwtAuthMiddleware } = require("../config/jwt"); // your auth check

router.post("/crawl", jwtAuthMiddleware, submitCrawlJob);

module.exports = router;
