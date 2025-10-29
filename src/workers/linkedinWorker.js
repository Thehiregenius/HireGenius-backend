const {linkedinQueue} = require("../utils/bull.js");
const StudentProfile = require("../models/StudentProfile");
const CrawlJob = require("../models/CrawlJob");
require("../config/db");

const { fetchLinkedinData } = require("./linkedInCrawler");

linkedinQueue.process(async (job) => {
  const { studentProfileId, linkedinUrl, crawlJobId } = job.data;
  console.log(`[LinkedIn Worker] Processing job ${crawlJobId} for ${studentProfileId}`);

  try {
    if (!studentProfileId || !crawlJobId || !linkedinUrl) {
      throw new Error("Missing required LinkedIn job data");
    }

    await CrawlJob.findByIdAndUpdate(crawlJobId, {
      status: "processing",
      startTime: new Date(),
    });

    let linkedinData = null;
    let errors = [];

    try {
      linkedinData = await fetchLinkedinData(linkedinUrl);
      console.log(`[LinkedIn Worker] Data collected for ${linkedinUrl}`);
    } catch (error) {
      console.error(`[LinkedIn Worker] Crawl failed:`, error);
      errors.push(`LinkedIn Error: ${error.message}`);
    }

    if (!linkedinData) throw new Error("No data collected from LinkedIn");

    const updatedProfile = await StudentProfile.findByIdAndUpdate(
      studentProfileId,
      {
        "rawData.linkedin": linkedinData,
        lastUpdated: new Date(),
      },
      { new: true }
    );

    const finalStatus = errors.length > 0 ? "partial" : "completed";
    await CrawlJob.findByIdAndUpdate(crawlJobId, {
      status: finalStatus,
      completionTime: new Date(),
      errorMessages: errors.length > 0 ? errors : undefined,
    });

    console.log(`[LinkedIn Worker] Job ${crawlJobId} completed (${finalStatus})`);
    return updatedProfile;
  } catch (err) {
    console.error(`[LinkedIn Worker] Job ${crawlJobId} failed:`, err);
    await CrawlJob.findByIdAndUpdate(crawlJobId, {
      status: "failed",
      completionTime: new Date(),
      $push: { errorMessages: err.message },
    });
    throw err;
  }
});
