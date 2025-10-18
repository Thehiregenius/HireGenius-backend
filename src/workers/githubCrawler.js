const axios = require("axios");
const puppeteer = require("puppeteer");
// -------------------------------------------------------------
// 🧩 Hybrid GitHub Data Fetcher (API + Bot)
// -------------------------------------------------------------

async function fetchGithubDataHybrid(url) {
  try {
    const username = extractUsername(url);
    if (!username) throw new Error("Invalid GitHub URL");

    // Step 1️⃣ — Fetch data via GitHub API
    const apiData = await fetchGithubAPI(username);

    // Step 2️⃣ — If any repo missing description or no pinned repos, scrape with Puppeteer
    const missingData = apiData.repos.some(
      (repo) => !repo.description || repo.description.trim() === ""
    );

    let scrapedData = null;
    if (missingData || !apiData.bio) {
      scrapedData = await scrapeGitHubProfile(username);
    }

    // Step 3️⃣ — Merge data
    const finalData = {
      username,
      name: apiData.name,
      bio: scrapedData?.bio || apiData.bio,
      followers: apiData.followers,
      following: apiData.following,
      totalRepos: apiData.repos.length,
      repos: apiData.repos.map((repo) => ({
        name: repo.name,
        description:
          repo.description ||
          scrapedData?.pinnedRepos.find((p) => p.name === repo.name)?.description ||
          "N/A",
        language: repo.language,
        stars: repo.stargazers_count,
        url: repo.html_url,
      })),
      pinnedRepos: scrapedData?.pinnedRepos || [],
    };

    return finalData;
  } catch (err) {
    throw new Error("Hybrid GitHub Fetch failed: " + err.message);
  }
}

// -------------------------------------------------------------
// 🧠 Helper Functions
// -------------------------------------------------------------

// Extract username from URL
function extractUsername(url) {
  const match = url.match(/github\.com\/([^/]+)/);
  return match ? match[1] : null;
}

// Fetch user + repos via API
async function fetchGithubAPI(username) {
  try {
    const headers = {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      "User-Agent": "TheHireGenius-Crawler",
    };

    const { data: user } = await axios.get(`https://api.github.com/users/${username}`, { headers });
    const { data: repos } = await axios.get(`https://api.github.com/users/${username}/repos?per_page=100`, { headers });

    return {
      name: user.name,
      bio: user.bio,
      followers: user.followers,
      following: user.following,
      repos,
    };
  } catch (err) {
    throw new Error("GitHub API Error: " + err.message);
  }
}

// Scrape pinned repos, bio, etc.
async function scrapeGitHubProfile(username) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto(`https://github.com/${username}`, { waitUntil: "networkidle2" });

    const scrapedData = await page.evaluate(() => {
      const pinnedRepos = Array.from(document.querySelectorAll("li.pinned-item-list-item")).map((el) => ({
        name: el.querySelector("span.repo")?.innerText || "",
        description: el.querySelector("p.pinned-item-desc")?.innerText.trim() || "",
        techStack: Array.from(el.querySelectorAll("span[itemprop='programmingLanguage']")).map((lang) => lang.innerText),
      }));

      const bio =
        document.querySelector("div.p-note")?.innerText.trim() ||
        document.querySelector("div.user-profile-bio")?.innerText.trim() ||
        null;

      return { pinnedRepos, bio };
    });

    await browser.close();
    return scrapedData;
  } catch (err) {
    if (browser) await browser.close();
    throw new Error("GitHub Scraping Error: " + err.message);
  }
}

module.exports = { fetchGithubDataHybrid };