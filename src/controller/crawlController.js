const StudentProfile = require("../models/StudentProfile");
const CrawlJob = require("../models/CrawlJob");
const { githubQueue, linkedinQueue } = require("../utils/bull");

// POST /api/crawl
const submitCrawlJob = async (req, res) => {
  try {
    const { githubUrl, linkedinUrl } = req.body;
    const userId = req.user.id; // assuming you have auth middleware

    if (!githubUrl && !linkedinUrl) {
      return res.status(400).json({ message: "At least one URL is required" });
    }

    // 1️⃣ Find or create StudentProfile
    let profile = await StudentProfile.findOne({ userId });

    if (!profile) {
      profile = new StudentProfile({
        userId,
        githubUrl,
        linkedinUrl,
        rawData: { github: {}, linkedin: {} },
      });
      await profile.save();
    } else {
      // Update URLs if profile already exists
      profile.githubUrl = githubUrl;
      profile.linkedinUrl = linkedinUrl;
      await profile.save();
    }

    // 2️⃣ Create separate jobs for each source
    const jobs = [];

    if (githubUrl) {
      const githubJob = await CrawlJob.create({
        studentProfileId: profile._id,
        githubUrl,
        status: "queued",
      });

      await githubQueue.add({
        studentProfileId: profile._id,
        githubUrl,
        crawlJobId: githubJob._id,
      });

      jobs.push({ type: "github", id: githubJob._id });
    }

    if (linkedinUrl) {
      const linkedinJob = await CrawlJob.create({
        studentProfileId: profile._id,
        linkedinUrl,
        status: "queued",
      });

      await linkedinQueue.add({
        studentProfileId: profile._id,
        linkedinUrl,
        crawlJobId: linkedinJob._id,
      });

      jobs.push({ type: "linkedin", id: linkedinJob._id });
    }

    // ✅ Respond with all created job IDs
    return res.status(200).json({
      message: "Crawl job(s) submitted successfully",
      jobs,
    });
  } catch (err) {
    console.error("❌ submitCrawlJob error:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
};

module.exports = { submitCrawlJob };
