// backend/workers/crawlerWorker.js
require("dotenv").config();
const crawlQueue = require("../utils/bull");
const StudentProfile = require("../models/StudentProfile");
const CrawlJob = require("../models/CrawlJob");
const axios = require("axios");
const cheerio = require("cheerio");
require("../config/db"); // This will connect to MongoDB

// Process crawl jobs
crawlQueue.process(async (job) => {
  const { studentProfileId, githubUrl, linkedinUrl, crawlJobId } = job.data;

  try {
    await CrawlJob.findByIdAndUpdate(crawlJobId, { status: "processing" });

    const githubData = await fetchGithubData(githubUrl);
    const linkedinData = await fetchLinkedinData(linkedinUrl);

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

// --- Helper Functions (basic mock for now) ---

async function fetchGithubData(url) {
  try {
    const username = url.split("github.com/")[1];
    const { data } = await axios.get(`https://api.github.com/users/${username}`, {
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
      },
    });

    return {
      username: data.login,
      name: data.name,
      bio: data.bio,
      public_repos: data.public_repos,
      followers: data.followers,
      following: data.following,
    };
  } catch (err) {
    throw new Error("Failed to fetch GitHub data: " + err.message);
  }
}

const puppeteer = require("puppeteer");

async function fetchLinkedinData(url) {
  try {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    // Login
    await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle2", timeout: 60000 });
    await page.type("#username", process.env.LINKEDIN_EMAIL, { delay: 50 });
    await page.type("#password", process.env.LINKEDIN_PASSWORD, { delay: 50 });
    await page.click("button[type='submit']");
    await page.waitForNavigation();


    // Go to profile page
    await page.goto(url, { waitUntil: "networkidle2" });

    // Example: scrape profile name & headline
    const profileData = await page.evaluate(() => {
      const name = document.querySelector("h1")?.innerText || "";
      const headline = document.querySelector(".text-body-medium")?.innerText || "";
      return { name, headline };
    });

    await browser.close();
    return profileData;
  } catch (err) {
    throw new Error("Failed to fetch LinkedIn data: " + err.message);
  }
}

