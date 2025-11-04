// javascript
// filepath: c:\Users\srush\Projects\TheHireGenius\backend\src\workers\fetchLinkedinData.js
require("dotenv").config();
const {
  loginOnce,
  crawlLinkedInProfile,
  closeSession,
} = require("./linkedInLoginCrawl.js");

const MAX_RETRIES = parseInt(process.env.WORKER_MAX_RETRIES, 10) || 3;
const MIN_DELAY = parseInt(process.env.WORKER_MIN_DELAY_MS, 10) || 2000;
const MAX_DELAY = parseInt(process.env.WORKER_MAX_DELAY_MS, 10) || 5000;

function randomDelay(min = MIN_DELAY, max = MAX_DELAY) {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLinkedinData(linkedinUrl, attempt = 0) {
  if (!linkedinUrl) return null;

  // normalize simple linkedin urls
  if (!/^https?:\/\//i.test(linkedinUrl)) {
    linkedinUrl = `https://${linkedinUrl}`;
  }

  // per-call timeout (ms)
  const CALL_TIMEOUT =
    parseInt(process.env.LINKEDIN_CALL_TIMEOUT_MS, 10) || 120000;

  try {
    await randomDelay();

    // call crawler with timeout
    console.log(
      `[LinkedIn Crawler] Attempting to fetch ${linkedinUrl} (attempt ${
        attempt + 1
      }/${MAX_RETRIES + 1})`
    );
    const crawlerPromise = crawlLinkedInProfile(linkedinUrl);
    const timeoutPromise = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("LinkedIn crawl timed out")), CALL_TIMEOUT)
    );
    const result = await Promise.race([crawlerPromise, timeoutPromise]);

    console.log(
      "[LinkedIn Crawler] Raw result:",
      JSON.stringify(result, null, 2)
    );

    if (!result || typeof result !== "object") {
      throw new Error("LinkedIn crawler returned null or non-object response");
    }

    if (result.success !== true || !result.data) {
      throw new Error(
        result.message || "LinkedIn crawler returned unsuccessful response"
      );
    }

    // Validate essential fields are present
    const requiredFields = [
      "name",
      "headline",
      "experiences",
      "education",
      "skills",
    ];
    const missingFields = requiredFields.filter((field) => !result.data[field]);
    if (missingFields.length > 0) {
      console.warn(
        `[LinkedIn Crawler] Data missing fields: ${missingFields.join(", ")}`
      );
    }

    console.log("[LinkedIn Crawler] Data extracted:", {
      name: result.data.name,
      headline: result.data.headline,
      experienceCount: (result.data.experiences || []).length,
      educationCount: (result.data.education || []).length,
      skillsCount: (result.data.skills || []).length,
    });

    return result.data;
  } catch (err) {
    console.error(`[LinkedIn Crawler] Error:`, err.message);

    if (attempt < MAX_RETRIES) {
      const backoffMin = 3000 + attempt * 2000;
      const backoffMax = 6000 + attempt * 2000;
      console.warn(
        `[LinkedIn Crawler] Retry ${
          attempt + 1
        }/${MAX_RETRIES} for ${linkedinUrl}`
      );
      await randomDelay(backoffMin, backoffMax);
      return fetchLinkedinData(linkedinUrl, attempt + 1);
    }
    throw new Error(
      `LinkedIn fetch failed after ${MAX_RETRIES} retries: ${err.message}`
    );
  }
}
module.exports = { fetchLinkedinData };
