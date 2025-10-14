// backend/utils/bull.js
const Queue = require("bull");
const dotenv = require("dotenv");

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// Create a new queue for crawling
const crawlQueue = new Queue("crawlQueue", REDIS_URL);

// Optional: basic event listeners for debugging
crawlQueue.on("error", (err) => console.error("❌ Queue Error:", err));
crawlQueue.on("waiting", (jobId) => console.log(`⏳ Job waiting: ${jobId}`));
crawlQueue.on("active", (job) => console.log(`🚀 Processing job ${job.id}`));
crawlQueue.on("completed", (job) => console.log(`✅ Completed job ${job.id}`));
crawlQueue.on("failed", (job, err) =>
  console.error(`❌ Job ${job.id} failed:`, err.message)
);

module.exports = crawlQueue;
