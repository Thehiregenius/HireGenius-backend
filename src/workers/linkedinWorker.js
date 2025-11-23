const {linkedinQueue, portfolioQueue} = require("../utils/bull.js");
const StudentProfile = require("../models/StudentProfile");
const CrawlJob = require("../models/CrawlJob");
require("../config/db");

const { fetchLinkedinData } = require("./linkedInCrawler");
const { coordinatePortfolioGeneration } = require("../utils/triggerPortfolio");

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

    // Update profile with whatever data we have (or empty) and mark as processed
    const updateData = {
      linkedinProcessed: true,
      lastUpdated: new Date(),
    };
    
    if (linkedinData) {
      updateData["rawData.linkedin"] = linkedinData;
    }

    const updatedProfile = await StudentProfile.findByIdAndUpdate(
      studentProfileId,
      updateData,
      { new: true }
    );

    const finalStatus = linkedinData ? (errors.length > 0 ? "partial" : "completed") : "failed";
    await CrawlJob.findByIdAndUpdate(crawlJobId, {
      status: finalStatus,
      completionTime: new Date(),
      errorMessages: errors.length > 0 ? errors : undefined,
    });

    console.log(`[LinkedIn Worker] Job ${crawlJobId} completed (${finalStatus})`);

    // Coordinate portfolio generation after both crawlers processed
    const coordResult = await coordinatePortfolioGeneration(updatedProfile.userId);
    console.log(`[LinkedIn Worker] Coordination result for user ${updatedProfile.userId}: ${coordResult}`);

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
