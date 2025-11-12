const express = require('express');
const router = express.Router();
const { 
  getPortfolio, 
  getPortfolioStatus, 
  regeneratePortfolio,
  generatePortfolio 
} = require('../controller/portfolioController');
const { jwtAuthMiddleware } = require('../config/jwt');

// GET /api/portfolio - Fetch generated portfolio from database
router.get('/', jwtAuthMiddleware, getPortfolio);

// GET /api/portfolio/status - Check portfolio generation status
router.get('/status', jwtAuthMiddleware, getPortfolioStatus);

// POST /api/portfolio/regenerate - Manually trigger portfolio regeneration
router.post('/regenerate', jwtAuthMiddleware, regeneratePortfolio);

// POST /api/portfolio/generate - Deprecated, kept for backwards compatibility
router.post('/generate', jwtAuthMiddleware, generatePortfolio);

module.exports = router;
