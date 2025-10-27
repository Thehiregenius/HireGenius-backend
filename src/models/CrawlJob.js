const mongoose = require("mongoose");

const crawlJobSchema = new mongoose.Schema(
  {
    studentProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
    },
    // githubUrl: { type: String, required: true },
    // linkedinUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
    },
    errorMessages: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("CrawlJob", crawlJobSchema);
