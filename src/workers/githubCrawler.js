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

    // let scrapedData = null;
    // if (missingData || !apiData.bio) {
    //   scrapedData = await scrapeGitHubProfile(username);
    // }

    // Step 3️⃣ — Merge data
    const finalData = {
      username,
      name: apiData.name,
      // bio: scrapedData?.bio || apiData.bio,
      
      bio: apiData.bio,
      followers: apiData.followers,
      following: apiData.following,
      totalRepos: apiData.repos.length,
      skills: apiData.skills || [],
      languages: [...new Set(apiData.repos.map(r => r.language).filter(Boolean))],
      repos: apiData.repos.map((repo) => ({
        name: repo.name,
        description:
          repo.description ||
          // scrapedData?.pinnedRepos.find((p) => p.name === repo.name)?.description ||
          "N/A",
        language: repo.language,
        stars: repo.stargazers_count,
        url: repo.html_url,
        topics: repo.topics || [],
      })),
      // pinnedRepos: scrapedData?.pinnedRepos || [],
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

    // Extract skills from various sources
    const skills = await extractSkills(username, repos, headers);

    return {
      name: user.name,
      bio: user.bio,
      followers: user.followers,
      following: user.following,
      repos,
      skills,
    };
  } catch (err) {
    throw new Error("GitHub API Error: " + err.message);
  }
}

// Extract skills from GitHub profile
async function extractSkills(username, repos, headers) {
  const skillsSet = new Set();

  // Removed README-based skill extraction

  // Step 2: Extract languages from all repositories
  const languageCount = {};
  repos.forEach(repo => {
    if (repo.language) {
      languageCount[repo.language] = (languageCount[repo.language] || 0) + 1;
    }
    
    // Also add topics as skills
    if (repo.topics && Array.isArray(repo.topics)) {
      repo.topics.forEach(topic => skillsSet.add(topic));
    }
  });

  // Add top languages (used in more than 1 repo)
  Object.entries(languageCount)
    .filter(([lang, count]) => count >= 1)
    .sort((a, b) => b[1] - a[1])
    .forEach(([lang]) => skillsSet.add(lang));

  return Array.from(skillsSet);
}



module.exports = { fetchGithubDataHybrid };