const StudentProfile = require("../models/StudentProfile");
const CrawlJob = require("../models/CrawlJob");
const crawlQueue = require("../utils/bull");

// POST /api/crawl
const submitCrawlJob = async (req, res) => {
  try {
    const { githubUrl, linkedinUrl } = req.body;
    const userId = req.user.id; // assuming you have auth middleware

    if (!githubUrl || !linkedinUrl) {
      return res.status(400).json({ message: "Both URLs are required" });
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
      // Update URLs if already exists
      profile.githubUrl = githubUrl;
      profile.linkedinUrl = linkedinUrl;
      await profile.save();
    }

    // 2️⃣ Create a CrawlJob
    const crawlJob = new CrawlJob({
      studentProfileId: profile._id,
      githubUrl,
      linkedinUrl,
      status: "queued",
    });
    await crawlJob.save();

    // 3️⃣ Add job to Bull queue
    await crawlQueue.add({
      studentProfileId: profile._id,
      githubUrl,
      linkedinUrl,
      crawlJobId: crawlJob._id,
    });

    return res.status(200).json({
      message: "Crawl job submitted successfully",
      crawlJobId: crawlJob._id,
    });
  } catch (err) {
    console.error("❌ submitCrawlJob error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  submitCrawlJob,
};
