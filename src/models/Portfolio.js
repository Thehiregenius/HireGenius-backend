const mongoose = require('mongoose');

const portfolioSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['pending', 'generating', 'completed', 'failed'],
      default: 'pending',
    },
    data: {
      name: String,
      email: String,
      avatar: String,
      githubUrl: String,
      linkedinUrl: String,
      bio: String,
      workExperience: [
        {
          title: String,
          company: String,
          duration: String,
          description: String,
          location: String,
        },
      ],
      skills: [String],
      projects: [
        {
          name: String,
          description: String,
          url: String,
          stars: Number,
          forks: Number,
          language: String,
          topics: [String],
        },
      ],
      achievements: [
        {
          type: String,
          title: String,
          issuer: String,
          date: String,
          description: String,
        },
      ],
    },
    error: String,
    lastGenerated: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Portfolio', portfolioSchema);
