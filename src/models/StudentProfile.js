const mongoose = require("mongoose");

const studentProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    githubUrl: { type: String, required: true },
    linkedinUrl: { type: String, required: true },
    rawData: {
      github: { type: Object, default: {} },
      linkedin: { type: Object, default: {} },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudentProfile", studentProfileSchema);
