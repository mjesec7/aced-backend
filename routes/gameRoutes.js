// routes/gameRoutes.js - Game System Routes

const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

// ✅ FIX: Correct import of authentication middleware
// verifyToken must be the function itself if authMiddleware exports it directly
const verifyToken = require('../middlewares/authMiddleware');

// 🔍 DEBUG: Log middleware import status
console.log('🎮 [GameRoutes] Loading game routes...');
console.log('🔍 [GameRoutes] verifyToken type:', typeof verifyToken);
console.log('🔍 [GameRoutes] verifyToken is function:', typeof verifyToken === 'function');

// Debug wrapper to see if routes are being hit
const logRequest = (routeName) => (req, res, next) => {
  console.log(`🎯 [GameRoutes] ${routeName} - ${req.method} ${req.path}`);
  next();
};

/**
 * POST /api/games/generate
 * Generate game from exercise/step
 * Body: { lessonId, stepIndex, gameType?, difficulty? }
 */
router.post('/generate', logRequest('Generate Game'), verifyToken, gameController.generateGame);
console.log('✅ [GameRoutes] Registered POST /api/games/generate');

/**
 * POST /api/games/submit
 * Submit game results and save analytics
 * Body: { userId, lessonId, stepIndex, gameType, score, accuracy, timeSpent, itemsCollected, correctItems, wrongItems, completed, actions?, metadata? }
 */
router.post('/submit', logRequest('Submit Results'), verifyToken, gameController.submitGameResults);
console.log('✅ [GameRoutes] Registered POST /api/games/submit');

/**
 * GET /api/games/leaderboard/:gameType
 * Get game leaderboard
 * Query params: limit (default 10), timeframe (all-time, today, week, month)
 */
router.get('/leaderboard/:gameType', logRequest('Get Leaderboard'), gameController.getLeaderboard);
console.log('✅ [GameRoutes] Registered GET /api/games/leaderboard/:gameType');

/**
 * GET /api/games/stats/:userId
 * Get user's game statistics
 */
router.get('/stats/:userId', logRequest('Get User Stats'), verifyToken, gameController.getUserGameStats);
console.log('✅ [GameRoutes] Registered GET /api/games/stats/:userId');

/**
 * POST /api/games/convert-exercise
 * Convert existing exercise to game
 * Body: { lessonId, stepIndex, gameType }
 */
router.post('/convert-exercise', logRequest('Convert Exercise'), verifyToken, gameController.convertExerciseToGame);
console.log('✅ [GameRoutes] Registered POST /api/games/convert-exercise');

/**
 * GET /api/games/types
 * Get available game types
 */
router.get('/types', logRequest('Get Game Types'), gameController.getGameTypes);
console.log('✅ [GameRoutes] Registered GET /api/games/types');

console.log('🎮 [GameRoutes] All game routes registered successfully');

module.exports = router;
