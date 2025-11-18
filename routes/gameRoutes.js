// routes/gameRoutes.js - Game System Routes

const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
// ✅ FIX: Correct folder name is 'middlewares' (plural), not 'middleware'
const { verifyToken } = require('../middlewares/authMiddleware');

/**
 * POST /api/games/generate
 * Generate game from exercise/step
 * Body: { lessonId, stepIndex, gameType?, difficulty? }
 */
router.post('/generate', verifyToken, gameController.generateGame);

/**
 * POST /api/games/submit
 * Submit game results and save analytics
 * Body: { userId, lessonId, stepIndex, gameType, score, accuracy, timeSpent, itemsCollected, correctItems, wrongItems, completed, actions?, metadata? }
 */
router.post('/submit', verifyToken, gameController.submitGameResults);

/**
 * GET /api/games/leaderboard/:gameType
 * Get game leaderboard
 * Query params: limit (default 10), timeframe (all-time, today, week, month)
 */
router.get('/leaderboard/:gameType', gameController.getLeaderboard);

/**
 * GET /api/games/stats/:userId
 * Get user's game statistics
 */
router.get('/stats/:userId', verifyToken, gameController.getUserGameStats);

/**
 * POST /api/games/convert-exercise
 * Convert existing exercise to game
 * Body: { lessonId, stepIndex, gameType }
 */
router.post('/convert-exercise', verifyToken, gameController.convertExerciseToGame);

/**
 * GET /api/games/types
 * Get available game types
 */
router.get('/types', gameController.getGameTypes);

module.exports = router;
