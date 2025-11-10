const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const CrawlJob = require('../models/CrawlJob');
const { githubQueue, linkedinQueue } = require('../utils/bull');

/**
 * GET /api/profile
 * Return combined user + studentProfile data for the logged in user.
 * Expects req.user.id to be set by your auth middleware.
 */
const getProfile = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await User.findById(userId).select('name email avatar role').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    let studentProfile = await StudentProfile.findOne({ userId }).select('githubUrl linkedinUrl rawData').lean();
    if (!studentProfile) {
      // create minimal profile so frontend always has the fields (StudentProfile schema requires urls)
      studentProfile = await StudentProfile.create({ userId, githubUrl: '', linkedinUrl: '' });
      studentProfile = await StudentProfile.findById(studentProfile._id).select('githubUrl linkedinUrl rawData').lean();
    }

    return res.json({
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      githubUrl: studentProfile.githubUrl || '',
      linkedinUrl: studentProfile.linkedinUrl || '',
      crawledData: studentProfile.rawData || null
    });
  } catch (err) {
    console.error('getProfile error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * PATCH /api/profile
 * Update name, avatar, githubUrl, linkedinUrl (one request updates both user and studentProfile).
 * Body: { name?, avatar?, githubUrl?, linkedinUrl? }
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // for multipart/form-data, fields are in req.body and uploaded file in req.file
    const { name, avatar: avatarFromBody, githubUrl, linkedinUrl } = req.body;

    // Basic validation
    if (name && String(name).trim().length < 2) return res.status(400).json({ error: 'Name too short' });
    if (githubUrl && !String(githubUrl).includes('github.com')) return res.status(400).json({ error: 'Invalid GitHub URL' });
    if (linkedinUrl && !String(linkedinUrl).includes('linkedin.com')) return res.status(400).json({ error: 'Invalid LinkedIn URL' });

    // Update User (name / avatar)
    const userUpdates = {};
    if (name) userUpdates.name = String(name).trim();
    
    // if file uploaded, construct public URL (served from /uploads)
    if (req.file) {
      const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
      userUpdates.avatar = avatarUrl;
    } else if (typeof avatarFromBody !== 'undefined') {
      // Allow explicit avatar update from request body (including empty string to remove)
      userUpdates.avatar = avatarFromBody ? String(avatarFromBody).trim() : null;
    }

    let updatedUser = null;
    if (Object.keys(userUpdates).length) {
      updatedUser = await User.findByIdAndUpdate(userId, userUpdates, { new: true }).select('name email avatar role');
      if (!updatedUser) return res.status(404).json({ error: 'User not found' });
    } else {
      updatedUser = await User.findById(userId).select('name email avatar role');
    }

    // Update or create StudentProfile (github/linkedin)
    // ...existing code...
    // Update or create StudentProfile (github/linkedin)
    let studentProfile = await StudentProfile.findOne({ userId });
    if (!studentProfile) {
      studentProfile = await StudentProfile.create({
        userId,
        githubUrl: githubUrl || '',
        linkedinUrl: linkedinUrl || ''
      });
    } else {
      if (typeof githubUrl !== 'undefined') studentProfile.githubUrl = githubUrl || '';
      if (typeof linkedinUrl !== 'undefined') studentProfile.linkedinUrl = linkedinUrl || '';
      await studentProfile.save();
    }

    // ENQUEUE CRAWL JOB (start crawler automatically when valid urls provided)
    const trimmedGithubUrl = githubUrl?.trim() || '';
    const trimmedLinkedinUrl = linkedinUrl?.trim() || '';
    
    // Only create one crawl job if at least one valid URL exists
    if (trimmedGithubUrl || trimmedLinkedinUrl) {
      const crawlJob = await CrawlJob.create({
        studentProfileId: studentProfile._id,
        githubUrl: trimmedGithubUrl || null,
        linkedinUrl: trimmedLinkedinUrl || null,
        status: 'queued',
        errorMessages: []
      });

      // Only add to GitHub queue if GitHub URL exists
      if (trimmedGithubUrl) {
        await githubQueue.add({
          studentProfileId: studentProfile._id.toString(),
          githubUrl: trimmedGithubUrl,
          crawlJobId: crawlJob._id.toString()
        });
      }

      // Only add to LinkedIn queue if LinkedIn URL exists
      if (trimmedLinkedinUrl) {
        await linkedinQueue.add({
          studentProfileId: studentProfile._id.toString(),
          linkedinUrl: trimmedLinkedinUrl,
          crawlJobId: crawlJob._id.toString()
        });
      }
    }

    return res.json({
      message: 'Profile updated',
      profile: {
        name: updatedUser.name,
        email: updatedUser.email,
        avatar: updatedUser.avatar,
        role: updatedUser.role,
        githubUrl: studentProfile.githubUrl,
        linkedinUrl: studentProfile.linkedinUrl
      }
    });

  } catch (err) {
    console.error('updateProfile error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getProfile,
  updateProfile
};