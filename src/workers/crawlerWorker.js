// javascript
// filepath: c:\Users\srush\Projects\TheHireGenius\backend\src\workers\crawlerWorker.js
const crawlQueue = require("../utils/bull");
const StudentProfile = require("../models/StudentProfile");
const CrawlJob = require("../models/CrawlJob");
const axios = require("axios");
const cheerio = require("cheerio");
require("../config/db"); // This will connect to MongoDB

// keep your GitHub crawler as-is
const { fetchGithubDataHybrid } = require("./githubCrawler");

// import the small wrapper you created
const { fetchLinkedinData } = require("./linkedInCrawler");

// Process crawl jobs
crawlQueue.process(async (job) => {
  const { studentProfileId, githubUrl, linkedinUrl, crawlJobId } = job.data;
  console.log(
    `[Crawler Worker] Processing job ${crawlJobId} for student ${studentProfileId}`
  );

  try {
    // Validate inputs
    if (!studentProfileId || !crawlJobId) {
      throw new Error(
        "Missing required job data: studentProfileId or crawlJobId"
      );
    }

    // Update job status to processing
    const updatedJob = await CrawlJob.findByIdAndUpdate(
      crawlJobId,
      { status: "processing", startTime: new Date() },
      { new: true }
    );

    if (!updatedJob) {
      throw new Error(`CrawlJob ${crawlJobId} not found`);
    }

    console.log(
      `[Crawler Worker] Starting data collection for job ${crawlJobId}`
    );

    // Collect data from sources
    let githubData = null;
    let linkedinData = null;
    let errors = [];

    if (githubUrl) {
      try {
        githubData = await fetchGithubDataHybrid(githubUrl);
        console.log(`[Crawler Worker] GitHub data collected for ${githubUrl}`);
      } catch (error) {
        console.error(`[Crawler Worker] GitHub crawl failed:`, error);
        errors.push(`GitHub Error: ${error.message}`);
      }
    }

    if (linkedinUrl) {
      try {
        linkedinData = await fetchLinkedinData(linkedinUrl);
        console.log(
          `[Crawler Worker] LinkedIn data collected for ${linkedinUrl}`
        );
      } catch (error) {
        console.error(`[Crawler Worker] LinkedIn crawl failed:`, error);
        errors.push(`LinkedIn Error: ${error.message}`);
      }
    }

    // Validate we have some data
    if (!githubData && !linkedinData) {
      throw new Error("No data collected from any source");
    }

    // Save data to student profile
    const updatedProfile = await StudentProfile.findByIdAndUpdate(
      studentProfileId,
      {
        rawData: { github: githubData, linkedin: linkedinData },
        lastUpdated: new Date(),
      },
      { new: true }
    );

    if (!updatedProfile) {
      throw new Error(`StudentProfile ${studentProfileId} not found`);
    }

    console.log(`[Crawler Worker] Data saved for student ${studentProfileId}`);

    // Update job status
    const finalStatus = errors.length > 0 ? "partial" : "completed";
    await CrawlJob.findByIdAndUpdate(crawlJobId, {
      status: finalStatus,
      completionTime: new Date(),
      errorMessages: errors.length > 0 ? errors : undefined,
    });

    console.log(
      `[Crawler Worker] Job ${crawlJobId} completed with status: ${finalStatus}`
    );

    return updatedProfile;
  } catch (err) {
    console.error(`[Crawler Worker] Job ${crawlJobId} failed:`, err);

    await CrawlJob.findByIdAndUpdate(crawlJobId, {
      status: "failed",
      completionTime: new Date(),
      $push: { errorMessages: err.message },
    });

    throw err;
  }
});
