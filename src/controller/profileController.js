const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const CrawlJob = require('../models/CrawlJob');
const { crawlQueue } = require('../utils/bull');

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

    const { name, avatar, githubUrl, linkedinUrl } = req.body;

    // Basic validation
    if (name && String(name).trim().length < 2) return res.status(400).json({ error: 'Name too short' });
    if (githubUrl && !String(githubUrl).includes('github.com')) return res.status(400).json({ error: 'Invalid GitHub URL' });
    if (linkedinUrl && !String(linkedinUrl).includes('linkedin.com')) return res.status(400).json({ error: 'Invalid LinkedIn URL' });

    // Update User (name / avatar)
    const userUpdates = {};
    if (name) userUpdates.name = String(name).trim();
    if (avatar) userUpdates.avatar = String(avatar).trim();

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

    // ENQUEUE CRAWL JOB (start crawler automatically when urls provided/updated)
    if ((githubUrl && githubUrl.trim()) || (linkedinUrl && linkedinUrl.trim())) {
      const crawlJob = await CrawlJob.create({
        studentProfileId: studentProfile._id,
        githubUrl: githubUrl && githubUrl.trim() ? githubUrl.trim() : null,
        linkedinUrl: linkedinUrl && linkedinUrl.trim() ? linkedinUrl.trim() : null,
        status: 'queued',
        errorMessages: []
      });

      await crawlQueue.add({
        studentProfileId: studentProfile._id.toString(),
        githubUrl: githubUrl && githubUrl.trim() ? githubUrl.trim() : null,
        linkedinUrl: linkedinUrl && linkedinUrl.trim() ? linkedinUrl.trim() : null,
        crawlJobId: crawlJob._id.toString()
      });
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
// ...existing code...

  } catch (err) {
    console.error('updateProfile error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getProfile,
  updateProfile
};