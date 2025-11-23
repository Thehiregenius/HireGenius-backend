const {githubQueue} = require("../utils/bull.js"); // separate queue file
const StudentProfile = require("../models/StudentProfile");
const CrawlJob = require("../models/CrawlJob");
require("../config/db");


const { fetchGithubDataHybrid } = require("./githubCrawler");
const { coordinatePortfolioGeneration } = require("../utils/triggerPortfolio");

githubQueue.process(async (job) => {
  const { studentProfileId, githubUrl, crawlJobId } = job.data;
  console.log(`[GitHub Worker] Processing job ${crawlJobId} for ${studentProfileId}`);

  try {
    if (!studentProfileId || !crawlJobId || !githubUrl) {
      throw new Error("Missing required GitHub job data");
    }

    await CrawlJob.findByIdAndUpdate(crawlJobId, {
      status: "processing",
      startTime: new Date(),
    });

    let githubData = null;
    let errors = [];

    try {
      githubData = await fetchGithubDataHybrid(githubUrl);
      console.log(`[GitHub Worker] Data collected for ${githubUrl}`);
    } catch (error) {
      console.error(`[GitHub Worker] Crawl failed:`, error);
      errors.push(`GitHub Error: ${error.message}`);
    }

    // Update profile with whatever data we have (or empty) and mark as processed
    const updateData = {
      githubProcessed: true,
      lastUpdated: new Date(),
    };
    
    if (githubData) {
      updateData["rawData.github"] = githubData;
    }

    const updatedProfile = await StudentProfile.findByIdAndUpdate(
      studentProfileId,
      updateData,
      { new: true }
    );

    const finalStatus = githubData ? (errors.length > 0 ? "partial" : "completed") : "failed";
    await CrawlJob.findByIdAndUpdate(crawlJobId, {
      status: finalStatus,
      completionTime: new Date(),
      errorMessages: errors.length > 0 ? errors : undefined,
    });

    console.log(`[GitHub Worker] Job ${crawlJobId} completed (${finalStatus})`);


    // Coordinate portfolio generation after both crawlers processed
    const coordResult = await coordinatePortfolioGeneration(updatedProfile.userId);
    console.log(`[GitHub Worker] Coordination result for user ${updatedProfile.userId}: ${coordResult}`);

    return updatedProfile;
  } catch (err) {
    console.error(`[GitHub Worker] Job ${crawlJobId} failed:`, err);
    await CrawlJob.findByIdAndUpdate(crawlJobId, {
      status: "failed",
      completionTime: new Date(),
      $push: { errorMessages: err.message },
    });
    throw err;
  }
});
