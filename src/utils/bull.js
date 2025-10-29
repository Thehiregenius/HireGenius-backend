// backend/utils/bull.js
const Queue = require("bull");
const dotenv = require("dotenv");

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// Create a new queue for crawling
// const crawlQueue = new Queue("crawlQueue", REDIS_URL);
const githubQueue = new Queue("githubQueue", REDIS_URL);
const linkedinQueue = new Queue("linkedinQueue", REDIS_URL);

// Optional: basic event listeners for debugging
const addListeners = (queue, name) => {
  queue.on("error", (err) => console.error("❌ Queue Error:", err));
  queue.on("waiting", (jobId) => console.log(`⏳ Job waiting: ${jobId}`));
  queue.on("active", (job) => console.log(`🚀 Processing job ${job.id}`));
  queue.on("completed", (job) => console.log(`✅ Completed job ${job.id}`));
  queue.on("failed", (job, err) => console.error(`❌ Job ${job.id} failed:`, err.message));
}

addListeners(githubQueue, "GitHub");
addListeners(linkedinQueue, "LinkedIn");

module.exports = {githubQueue, linkedinQueue};
