const { portfolioQueue } = require('./bull');
const StudentProfile = require('../models/StudentProfile');
const Portfolio = require('../models/Portfolio');

/**
 * Coordination logic: Only trigger portfolio after BOTH crawlers have finished processing
 * (success or failure). Use available data if any. If neither source succeeded, record failure.
 * Returns: 'queued' | 'waiting' | 'failed'
 */
async function coordinatePortfolioGeneration(userId) {
  const profile = await StudentProfile.findOne({ userId }).lean();
  if (!profile) {
    console.warn(`[Portfolio Trigger] No StudentProfile for user ${userId}`);
    return 'waiting';
  }

  const githubDone = profile.githubProcessed === true;
  const linkedinDone = profile.linkedinProcessed === true;
  if (!githubDone || !linkedinDone) {
    // Still waiting for the other crawler to finish.
    return 'waiting';
  }

  const hasGithub = profile.rawData?.github && Object.keys(profile.rawData.github).length > 0;
  const hasLinkedin = profile.rawData?.linkedin && Object.keys(profile.rawData.linkedin).length > 0;

  if (!hasGithub && !hasLinkedin) {
    // Both finished but no data available from either.
    await Portfolio.findOneAndUpdate(
      { userId },
      { status: 'failed', error: 'Unable to generate portfolio: No GitHub or LinkedIn data.' },
      { upsert: true }
    );
    console.error(`[Portfolio Trigger] Generation failed for user ${userId}: No data sources.`);
    return 'failed';
  }

  // At least one source has data; queue generation.
  await portfolioQueue.add({ userId });
  console.log(`[Portfolio Trigger] Portfolio generation queued for user ${userId}`);
  return 'queued';
}

module.exports = { coordinatePortfolioGeneration };