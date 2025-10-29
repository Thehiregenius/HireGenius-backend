// backend/worker.js
require("./workers/githubWorker");
require("./workers/linkedinWorker");

console.log("👷 Worker is running and listening for GitHub and LinkedIn jobs...");
