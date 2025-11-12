const { portfolioQueue } = require('../utils/bull');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const Portfolio = require('../models/Portfolio');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Portfolio Worker
 * Processes portfolio generation jobs in the background
 */
portfolioQueue.process(async (job) => {
  const { userId } = job.data;
  console.log(`📝 Starting portfolio generation for user: ${userId}`);

  try {
    // Update status to generating
    await Portfolio.findOneAndUpdate(
      { userId },
      { status: 'generating' },
      { upsert: true, new: true }
    );

    // Fetch user and profile data
    const user = await User.findById(userId).select('name email avatar').lean();
    if (!user) {
      throw new Error('User not found');
    }

    const studentProfile = await StudentProfile.findOne({ userId }).lean();
    if (!studentProfile) {
      throw new Error('Profile not found');
    }

    const crawledData = studentProfile.rawData || {};
    const githubData = crawledData.github || {};
    const linkedinData = crawledData.linkedin || {};

    // Check if we have any crawled data
    if (!githubData || Object.keys(githubData).length === 0) {
      if (!linkedinData || Object.keys(linkedinData).length === 0) {
        throw new Error('No crawled data available. Please add GitHub/LinkedIn URLs.');
      }
    }

    // Extract portfolio information
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
      console.error('Gemini AI error, using fallback:', aiError);
      portfolioData.bio = generateFallbackBio(portfolioData);
    }

    // Save portfolio to database
    await Portfolio.findOneAndUpdate(
      { userId },
      {
        status: 'completed',
        data: portfolioData,
        lastGenerated: new Date(),
        error: null,
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Portfolio generation completed for user: ${userId}`);
    return { success: true, portfolioData };
  } catch (error) {
    console.error(`❌ Portfolio generation failed for user ${userId}:`, error);

    // Update status to failed
    await Portfolio.findOneAndUpdate(
      { userId },
      {
        status: 'failed',
        error: error.message,
      },
      { upsert: true, new: true }
    );

    throw error;
  }
});

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
GitHub Bio: ${githubData.bio || 'No bio'}
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

  const skillsText =
    skills.length > 0 ? `skilled in ${skills.slice(0, 3).join(', ')}` : 'a passionate developer';

  const projectsText =
    projects.length > 0
      ? ` with ${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`
      : '';

  const expText =
    workExperience.length > 0
      ? ` and ${workExperience.length} ${workExperience.length === 1 ? 'professional experience' : 'professional experiences'}`
      : '';

  return `${name} is a ${skillsText}${projectsText}${expText}. Passionate about creating innovative solutions and continuously learning new technologies.`;
}

/**
 * Extract work experience from LinkedIn data
 */
function extractWorkExperience(linkedinData) {
  const experiences = [];

  if (linkedinData.experience && Array.isArray(linkedinData.experience)) {
    linkedinData.experience.forEach((exp) => {
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

  // From GitHub: skills array (extracted from README and repos)
  if (githubData.skills && Array.isArray(githubData.skills)) {
    githubData.skills.forEach((skill) => skillsSet.add(skill));
  }

  // From GitHub: languages array
  if (githubData.languages && Array.isArray(githubData.languages)) {
    githubData.languages.forEach((lang) => skillsSet.add(lang));
  }

  // From GitHub repos: topics
  if (githubData.repos && Array.isArray(githubData.repos)) {
    githubData.repos.forEach((repo) => {
      if (repo.topics && Array.isArray(repo.topics)) {
        repo.topics.forEach((topic) => skillsSet.add(topic));
      }
    });
  }

  // From LinkedIn: skills array
  if (linkedinData.skills && Array.isArray(linkedinData.skills)) {
    linkedinData.skills.forEach((skill) => {
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

  // Use repos array from GitHub crawler
  if (githubData.repos && Array.isArray(githubData.repos)) {
    githubData.repos.forEach((repo) => {
      // Skip repos without valid description or language
      const hasValidDescription = repo.description && repo.description !== 'N/A' && repo.description.trim() !== '';
      const hasValidLanguage = repo.language && repo.language !== 'N/A' && repo.language.trim() !== '';
      
      // Only include projects with at least description OR language
      if (hasValidDescription || hasValidLanguage) {
        projects.push({
          name: repo.name || 'Untitled Project',
          description: hasValidDescription ? repo.description : 'No description available',
          url: repo.url || repo.html_url || '',
          stars: repo.stars || 0,
          forks: repo.forks || 0,
          language: hasValidLanguage ? repo.language : null,
          topics: repo.topics || [],
        });
      }
    });
  }
  
  // Fallback: check repositories field (if using old data structure)
  else if (githubData.repositories && Array.isArray(githubData.repositories)) {
    githubData.repositories.forEach((repo) => {
      const hasValidDescription = repo.description && repo.description !== 'N/A' && repo.description.trim() !== '';
      const hasValidLanguage = repo.language && repo.language !== 'N/A' && repo.language.trim() !== '';
      
      if (hasValidDescription || hasValidLanguage) {
        projects.push({
          name: repo.name || 'Untitled Project',
          description: hasValidDescription ? repo.description : 'No description available',
          url: repo.url || repo.html_url || '',
          stars: repo.stars || repo.stargazers_count || 0,
          forks: repo.forks || repo.forks_count || 0,
          language: hasValidLanguage ? repo.language : null,
          topics: repo.topics || [],
        });
      }
    });
  }

  // Sort by stars (most starred first) and limit to top projects
  return projects
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 20); // Limit to top 20 projects
}

/**
 * Extract achievements from LinkedIn data
 */
function extractAchievements(linkedinData) {
  const achievements = [];

  // Certifications
  if (linkedinData.certifications && Array.isArray(linkedinData.certifications)) {
    linkedinData.certifications.forEach((cert) => {
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
    linkedinData.awards.forEach((award) => {
      achievements.push({
        type: 'Award',
        title: award.title || award.name || 'Award',
        issuer: award.issuer || '',
        date: award.date || '',
        description: award.description || '',
      });
    });
  }

  // Education achievements
  if (linkedinData.education && Array.isArray(linkedinData.education)) {
    linkedinData.education.forEach((edu) => {
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

console.log('📝 Portfolio worker is running...');

module.exports = portfolioQueue;
