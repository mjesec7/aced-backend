// routes/gameRoutes.js - Game System Routes

const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

// ✅ FIX: Correct import of authentication middleware
// verifyToken must be the function itself if authMiddleware exports it directly
const verifyToken = require('../middlewares/authMiddleware');

// Debug wrapper to see if routes are being hit
const logRequest = (routeName) => (req, res, next) => {
  next();
};

/**
 * POST /api/games/generate
 * Generate game from exercise/step
 * Body: { lessonId, stepIndex, gameType?, difficulty? }
 */
router.post('/generate', logRequest('Generate Game'), verifyToken, gameController.generateGame);

/**
 * GET /api/games/submit - Return helpful error for wrong method
 * This catches browser preflight/direct navigation attempts
 */
router.get('/submit', (req, res) => {
  res.status(405).json({
    success: false,
    error: 'Method Not Allowed',
    message: 'This endpoint requires POST method with game results in body',
    expectedBody: {
      userId: 'string',
      lessonId: 'string',
      stepIndex: 'number',
      gameType: 'string',
      score: 'number',
      accuracy: 'number',
      timeSpent: 'number',
      completed: 'boolean'
    }
  });
});

/**
 * POST /api/games/submit
 * Submit game results and save analytics
 * Body: { userId, lessonId, stepIndex, gameType, score, accuracy, timeSpent, itemsCollected, correctItems, wrongItems, completed, actions?, metadata? }
 */
router.post('/submit', logRequest('Submit Results'), verifyToken, gameController.submitGameResults);

/**
 * GET /api/games/leaderboard/:gameType
 * Get game leaderboard
 * Query params: limit (default 10), timeframe (all-time, today, week, month)
 */
router.get('/leaderboard/:gameType', logRequest('Get Leaderboard'), gameController.getLeaderboard);

/**
 * GET /api/games/stats/:userId
 * Get user's game statistics
 */
router.get('/stats/:userId', logRequest('Get User Stats'), verifyToken, gameController.getUserGameStats);

/**
 * POST /api/games/convert-exercise
 * Convert existing exercise to game
 * Body: { lessonId, stepIndex, gameType }
 */
router.post('/convert-exercise', logRequest('Convert Exercise'), verifyToken, gameController.convertExerciseToGame);

/**
 * GET /api/games/types
 * Get available game types
 */
router.get('/types', logRequest('Get Game Types'), gameController.getGameTypes);

module.exports = router;
