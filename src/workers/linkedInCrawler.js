// javascript
// filepath: c:\Users\srush\Projects\TheHireGenius\backend\src\workers\fetchLinkedinData.js
require("dotenv").config();
const { loginOnce, crawlLinkedInProfile, closeSession } = require("./linkedInLoginCrawl.js");

const MAX_RETRIES = parseInt(process.env.WORKER_MAX_RETRIES, 10) || 3;
const MIN_DELAY = parseInt(process.env.WORKER_MIN_DELAY_MS, 10) || 2000;
const MAX_DELAY = parseInt(process.env.WORKER_MAX_DELAY_MS, 10) || 5000;

function randomDelay(min = MIN_DELAY, max = MAX_DELAY) {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Worker-level wrapper: calls crawlLinkedInProfile and applies retry/backoff + inter-request delay.
 * Returns structured profile data or throws on failure.
 */
// async function fetchLinkedinData(linkedinUrl, attempt = 0) {
//   if (!linkedinUrl) return null;
//   try {
//     await randomDelay();
//     const result = await crawlLinkedInProfile(linkedinUrl);
//     if (!result || !result.success) {
//       throw new Error(result && result.message ? result.message : "LinkedIn crawler returned failure");
//     }
//     return result.data;
//   } catch (err) {
//     if (attempt < MAX_RETRIES) {
//       console.warn(`LinkedIn retry ${attempt + 1}/${MAX_RETRIES} for ${linkedinUrl}: ${err.message}`);
//       await randomDelay(3000 + attempt * 2000, 6000 + attempt * 2000);
//       return await fetchLinkedinData(linkedinUrl, attempt + 1);

//     }
//     throw new Error("LinkedIn fetch failed after retries: " + err.message);
//   }
// }
// ...existing code...
async function fetchLinkedinData(linkedinUrl, attempt = 0) {
  if (!linkedinUrl) return null;

  // normalize simple linkedin urls
  if (!/^https?:\/\//i.test(linkedinUrl)) {
    linkedinUrl = `https://${linkedinUrl}`;
  }

  // per-call timeout (ms)
  const CALL_TIMEOUT = parseInt(process.env.LINKEDIN_CALL_TIMEOUT_MS, 10) || 120000;

  try {
    await randomDelay();

    // call crawler with timeout
    const crawlerPromise = crawlLinkedInProfile(linkedinUrl);
    const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error("LinkedIn crawl timed out")), CALL_TIMEOUT));
    const result = await Promise.race([crawlerPromise, timeoutPromise]);

    // validate result shape
    if (!result || typeof result !== "object" || result.success !== true || !result.data) {
      throw new Error(result && result.message ? result.message : "LinkedIn crawler returned invalid response");
    }

    return result.data;
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const backoffMin = 3000 + attempt * 2000;
      const backoffMax = 6000 + attempt * 2000;
      console.warn(`LinkedIn retry ${attempt + 1}/${MAX_RETRIES} for ${linkedinUrl}: ${err.message}`);
      await randomDelay(backoffMin, backoffMax);
      return fetchLinkedinData(linkedinUrl, attempt + 1);
    }
    throw new Error("LinkedIn fetch failed after retries: " + err.message);
  }
}
// ...existing code...
module.exports = { fetchLinkedinData };