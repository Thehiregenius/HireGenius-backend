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

  // Step 1: Check for README with username (e.g., github.com/srushti20 -> look for srushti20 repo)
  try {
    const readmeRepo = repos.find(repo => 
      repo.name.toLowerCase() === username.toLowerCase()
    );

    if (readmeRepo) {
      console.log(`Found README repo: ${readmeRepo.name}`);
      const readmeContent = await fetchReadmeContent(username, readmeRepo.name, headers);
      if (readmeContent) {
        const readmeSkills = extractSkillsFromReadme(readmeContent);
        readmeSkills.forEach(skill => skillsSet.add(skill));
      }
    }
  } catch (err) {
    console.log(`No README repo found for ${username}`);
  }

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

// Fetch README content from a repository
async function fetchReadmeContent(username, repoName, headers) {
  try {
    const { data } = await axios.get(
      `https://api.github.com/repos/${username}/${repoName}/readme`,
      { headers }
    );
    
    // Decode base64 content
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return content;
  } catch (err) {
    console.log(`Could not fetch README for ${username}/${repoName}`);
    return null;
  }
}

// Extract skills/technologies from README content
function extractSkillsFromReadme(content) {
  const skills = new Set();
  
  // Common tech keywords to look for
  const techKeywords = [
    // Languages
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C\\+\\+', 'C#', 'Ruby', 'Go', 'Rust', 'PHP', 'Swift', 'Kotlin',
    // Frontend
    'React', 'Vue', 'Angular', 'Next\\.js', 'Nuxt', 'Svelte', 'HTML', 'CSS', 'SCSS', 'Tailwind', 'Bootstrap',
    // Backend
    'Node\\.js', 'Express', 'Django', 'Flask', 'FastAPI', 'Spring', 'Laravel', 'Rails',
    // Databases
    'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'SQLite', 'Firebase', 'Supabase',
    // Cloud/DevOps
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'CI/CD', 'GitHub Actions',
    // Tools
    'Git', 'VS Code', 'Postman', 'Figma', 'Webpack', 'Vite',
    // Mobile
    'React Native', 'Flutter', 'Android', 'iOS',
    // Other
    'GraphQL', 'REST API', 'WebSocket', 'OAuth', 'JWT', 'Testing', 'Jest', 'Mocha'
  ];

  // Search for tech keywords (case-insensitive)
  techKeywords.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    if (regex.test(content)) {
      // Normalize the skill name
      const normalizedSkill = keyword.replace(/\\./g, '.');
      skills.add(normalizedSkill);
    }
  });

  // Look for skills sections
  const skillsSection = content.match(/(?:##|###)\s*(?:Skills|Technologies|Tech Stack|Tools)(.*?)(?=##|###|$)/is);
  if (skillsSection) {
    const section = skillsSection[1];
    
    // Extract items from bullet points or badges
    const items = section.match(/[-*]\s*([^\n]+)/g);
    if (items) {
      items.forEach(item => {
        const cleaned = item.replace(/[-*]\s*/, '').trim();
        // Remove markdown links and images
        const skillName = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                                .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
                                .trim();
        if (skillName && skillName.length < 30) {
          skills.add(skillName);
        }
      });
    }
  }

  return Array.from(skills);
}

// Scrape pinned repos, bio, etc.
// async function scrapeGitHubProfile(username) {
//   let browser;
//   try {
//     browser = await puppeteer.launch({
//       headless: true,
//       args: ["--no-sandbox", "--disable-setuid-sandbox"],
//     });

//     const page = await browser.newPage();
//     await page.goto(`https://github.com/${username}`, { waitUntil: "networkidle2" });

//     const scrapedData = await page.evaluate(() => {
//       const pinnedRepos = Array.from(document.querySelectorAll("li.pinned-item-list-item")).map((el) => ({
//         name: el.querySelector("span.repo")?.innerText || "",
//         description: el.querySelector("p.pinned-item-desc")?.innerText.trim() || "",
//         techStack: Array.from(el.querySelectorAll("span[itemprop='programmingLanguage']")).map((lang) => lang.innerText),
//       }));

//       const bio =
//         document.querySelector("div.p-note")?.innerText.trim() ||
//         document.querySelector("div.user-profile-bio")?.innerText.trim() ||
//         null;

//       return { pinnedRepos, bio };
//     });

//     await browser.close();
//     return scrapedData;
//   } catch (err) {
//     if (browser) await browser.close();
//     throw new Error("GitHub Scraping Error: " + err.message);
//   }
// }

module.exports = { fetchGithubDataHybrid };