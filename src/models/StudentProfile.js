const mongoose = require("mongoose");

const studentProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Make URLs optional and default to empty string so we can create
    // a minimal StudentProfile record without failing validation.
    githubUrl: { type: String, default: "" },
    linkedinUrl: { type: String, default: "" },
    rawData: {
      github: { type: Object, default: {} },
      linkedin: { type: Object, default: {} },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudentProfile", studentProfileSchema);
