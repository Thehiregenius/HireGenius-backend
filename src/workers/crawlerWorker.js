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

  try {
    await CrawlJob.findByIdAndUpdate(crawlJobId, { status: "processing" });

    const githubData = githubUrl ? await fetchGithubDataHybrid(githubUrl) : null;
    const linkedinData = linkedinUrl ? await fetchLinkedinData(linkedinUrl) : null;


    await StudentProfile.findByIdAndUpdate(studentProfileId, {
      rawData: { github: githubData, linkedin: linkedinData },
    });

    await CrawlJob.findByIdAndUpdate(crawlJobId, { status: "completed" });
  } catch (err) {
    await CrawlJob.findByIdAndUpdate(crawlJobId, {
      status: "failed",
      $push: { errorMessages: err.message },
    });
    throw err;
  }
});