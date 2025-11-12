const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const Portfolio = require('../models/Portfolio');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * GET /api/portfolio
 * Fetch generated portfolio data from database
 */
const getPortfolio = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const portfolio = await Portfolio.findOne({ userId }).lean();
    
    if (!portfolio) {
      return res.status(404).json({ 
        error: 'Portfolio not found',
        message: 'Portfolio has not been generated yet. Please add GitHub/LinkedIn URLs and wait for crawling to complete.'
      });
    }

    if (portfolio.status === 'failed') {
      return res.status(500).json({
        status: portfolio.status,
        error: portfolio.error,
        message: 'Portfolio generation failed. Please try again.'
      });
    }

    if (portfolio.status === 'pending' || portfolio.status === 'generating') {
      return res.status(202).json({
        status: portfolio.status,
        message: 'Portfolio is being generated. Please check back shortly.',
        lastGenerated: portfolio.lastGenerated
      });
    }

    // Status is 'completed'
    return res.status(200).json({
      status: portfolio.status,
      data: portfolio.data,
      lastGenerated: portfolio.lastGenerated
    });
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    return res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
};

/**
 * GET /api/portfolio/status
 * Check portfolio generation status
 */
const getPortfolioStatus = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const portfolio = await Portfolio.findOne({ userId }).select('status error lastGenerated').lean();
    
    if (!portfolio) {
      return res.status(404).json({ 
        status: 'not_found',
        message: 'Portfolio has not been generated yet. Please add GitHub/LinkedIn URLs.'
      });
    }

    return res.status(200).json({
      status: portfolio.status,
      lastGenerated: portfolio.lastGenerated,
      error: portfolio.error || null
    });
  } catch (error) {
    console.error('Error checking portfolio status:', error);
    return res.status(500).json({ error: 'Failed to check portfolio status' });
  }
};

/**
 * POST /api/portfolio/regenerate
 * Manually trigger portfolio regeneration (for future use)
 */
const regeneratePortfolio = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const studentProfile = await StudentProfile.findOne({ userId }).lean();
    if (!studentProfile) {
      return res.status(404).json({ error: 'Profile not found. Please add GitHub/LinkedIn URLs first.' });
    }

    const crawledData = studentProfile.rawData || {};
    if (!crawledData.github || !crawledData.linkedin) {
      return res.status(400).json({ 
        error: 'Incomplete data',
        message: 'Both GitHub and LinkedIn data are required. Please ensure crawling is complete.'
      });
    }

    // Update or create portfolio with pending status
    await Portfolio.findOneAndUpdate(
      { userId },
      { status: 'pending', error: null },
      { upsert: true, new: true }
    );

    // Trigger portfolio generation job
    const { portfolioQueue } = require('../utils/bull');
    await portfolioQueue.add({ userId });

    return res.status(202).json({ 
      message: 'Portfolio regeneration started. Check status for updates.',
      status: 'pending'
    });
  } catch (error) {
    console.error('Error triggering portfolio regeneration:', error);
    return res.status(500).json({ error: 'Failed to trigger portfolio regeneration' });
  }
};

/**
 * Deprecated - kept for reference
 * POST /api/portfolio/generate
 * Generate portfolio data from crawled information
 * Uses Gemini AI to create a professional bio
 */
const generatePortfolio = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Fetch user and profile data
    const user = await User.findById(userId).select('name email avatar').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const studentProfile = await StudentProfile.findOne({ userId }).lean();
    if (!studentProfile) {
      return res.status(404).json({ error: 'Profile not found. Please add GitHub/LinkedIn URLs first.' });
    }

    const crawledData = studentProfile.rawData || {};
    const githubData = crawledData.github || {};
    const linkedinData = crawledData.linkedin || {};

    // Extract relevant information from crawled data
    const portfolioData = {
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      githubUrl: studentProfile.githubUrl,
      linkedinUrl: studentProfile.linkedinUrl,
      bio: '',
      workExperience: extractWorkExperience(linkedinData),
      skills: extractSkills(githubData, linkedinData),
      projects: extractProjects(githubData),
      achievements: extractAchievements(linkedinData),
    };

    // Generate bio using Gemini AI
    try {
      portfolioData.bio = await generateBioWithGemini(portfolioData, githubData, linkedinData);
    } catch (aiError) {
      console.error('Gemini AI error:', aiError);
      portfolioData.bio = generateFallbackBio(portfolioData);
    }

    return res.json({ portfolio: portfolioData });
  } catch (err) {
    console.error('generatePortfolio error:', err);
    return res.status(500).json({ error: 'Server error while generating portfolio' });
  }
};

/**
 * Generate bio using Gemini AI
 */
async function generateBioWithGemini(portfolioData, githubData, linkedinData) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `
You are a professional portfolio writer. Based on the following information about a student developer, write a concise, engaging professional bio (2-3 sentences, max 150 words).

Name: ${portfolioData.name}
Skills: ${portfolioData.skills.join(', ') || 'Not specified'}
Projects: ${portfolioData.projects.length} projects
Work Experience: ${portfolioData.workExperience.length} experiences
GitHub Profile: ${githubData.bio || 'No bio'}
LinkedIn Summary: ${linkedinData.summary || 'No summary'}

Write a professional, third-person bio that highlights their expertise, passion, and key strengths. Make it engaging and suitable for a portfolio website.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const bio = response.text();
    
    return bio.trim();
  } catch (error) {
    console.error('Gemini generation error:', error);
    throw error;
  }
}

/**
 * Fallback bio if AI fails
 */
function generateFallbackBio(portfolioData) {
  const { name, skills, projects, workExperience } = portfolioData;
  
  const skillsText = skills.length > 0 
    ? `skilled in ${skills.slice(0, 3).join(', ')}` 
    : 'a passionate developer';
  
  const projectsText = projects.length > 0 
    ? ` with ${projects.length} ${projects.length === 1 ? 'project' : 'projects'}` 
    : '';
  
  const expText = workExperience.length > 0 
    ? ` and ${workExperience.length} ${workExperience.length === 1 ? 'professional experience' : 'professional experiences'}` 
    : '';

  return `${name} is a ${skillsText}${projectsText}${expText}. Passionate about creating innovative solutions and continuously learning new technologies.`;
}

/**
 * Extract work experience from LinkedIn data
 */
function extractWorkExperience(linkedinData) {
  const experiences = [];
  
  // LinkedIn typically has experience array
  if (linkedinData.experience && Array.isArray(linkedinData.experience)) {
    linkedinData.experience.forEach(exp => {
      experiences.push({
        title: exp.title || exp.position || 'Position',
        company: exp.company || exp.companyName || 'Company',
        duration: exp.duration || `${exp.startDate || ''} - ${exp.endDate || 'Present'}`,
        description: exp.description || '',
        location: exp.location || '',
      });
    });
  }

  return experiences;
}

/**
 * Extract skills from GitHub and LinkedIn data
 */
function extractSkills(githubData, linkedinData) {
  const skillsSet = new Set();

  // From GitHub: languages, topics
  if (githubData.languages && Array.isArray(githubData.languages)) {
    githubData.languages.forEach(lang => skillsSet.add(lang));
  }

  if (githubData.topics && Array.isArray(githubData.topics)) {
    githubData.topics.forEach(topic => skillsSet.add(topic));
  }

  // From LinkedIn: skills array
  if (linkedinData.skills && Array.isArray(linkedinData.skills)) {
    linkedinData.skills.forEach(skill => {
      if (typeof skill === 'string') {
        skillsSet.add(skill);
      } else if (skill.name) {
        skillsSet.add(skill.name);
      }
    });
  }

  return Array.from(skillsSet);
}

/**
 * Extract projects from GitHub data
 */
function extractProjects(githubData) {
  const projects = [];

  if (githubData.repositories && Array.isArray(githubData.repositories)) {
    githubData.repositories.forEach(repo => {
      projects.push({
        name: repo.name || 'Untitled Project',
        description: repo.description || 'No description available',
        url: repo.url || repo.html_url || '',
        stars: repo.stars || repo.stargazers_count || 0,
        forks: repo.forks || repo.forks_count || 0,
        language: repo.language || 'Unknown',
        topics: repo.topics || [],
      });
    });
  }

  return projects;
}

/**
 * Extract achievements from LinkedIn data
 */
function extractAchievements(linkedinData) {
  const achievements = [];

  // Certifications
  if (linkedinData.certifications && Array.isArray(linkedinData.certifications)) {
    linkedinData.certifications.forEach(cert => {
      achievements.push({
        type: 'Certification',
        title: cert.name || cert.title || 'Certification',
        issuer: cert.issuer || cert.authority || '',
        date: cert.date || cert.issueDate || '',
        description: cert.description || '',
      });
    });
  }

  // Awards
  if (linkedinData.awards && Array.isArray(linkedinData.awards)) {
    linkedinData.awards.forEach(award => {
      achievements.push({
        type: 'Award',
        title: award.title || award.name || 'Award',
        issuer: award.issuer || '',
        date: award.date || '',
        description: award.description || '',
      });
    });
  }

  // Education achievements (honors, etc.)
  if (linkedinData.education && Array.isArray(linkedinData.education)) {
    linkedinData.education.forEach(edu => {
      if (edu.honors || edu.activities) {
        achievements.push({
          type: 'Education',
          title: edu.degree || 'Academic Achievement',
          issuer: edu.school || '',
          date: edu.endDate || '',
          description: edu.honors || edu.activities || '',
        });
      }
    });
  }

  return achievements;
}

module.exports = {
  getPortfolio,
  getPortfolioStatus,
  regeneratePortfolio,
  generatePortfolio, // Deprecated, kept for backwards compatibility
};
