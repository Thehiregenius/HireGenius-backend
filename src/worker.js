// backend/worker.js
require("./workers/githubWorker");
require("./workers/linkedinWorker");
require("./workers/portfolioWorker");

console.log("👷 Worker is running and listening for GitHub, LinkedIn, and Portfolio jobs...");
