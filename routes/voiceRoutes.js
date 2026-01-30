// routes/voiceRoutes.js - Voice Answer Verification Routes
const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const voiceController = require('../controllers/voiceController');
const createRateLimiter = require('../middlewares/rateLimiter');

// Rate limiter for voice verification (less restrictive than TTS)
const voiceVerifyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP/User to 100 requests per windowMs
  message: { success: false, error: 'Too many voice verification requests, please try again later.' }
});

// ========================================
// VOICE ANSWER VERIFICATION
// ========================================

/**
 * POST /api/voice/verify-answer
 * Verify a spoken answer against the correct answer using fuzzy matching.
 *
 * Request body:
 * {
 *   transcript: string,      // The user's spoken answer (transcribed from STT)
 *   correctAnswer: string,   // The expected correct answer
 *   language: string,        // Language code (en, ru, uz) - default: 'en'
 *   threshold: number        // Similarity threshold (0-1) - default: 0.85
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   correct: boolean,        // Whether the answer matches within threshold
 *   similarity: number,      // Similarity score (0-1)
 *   feedback: string         // Localized feedback message
 * }
 */
router.post('/verify-answer', verifyToken, voiceVerifyLimiter, voiceController.verifyVoiceAnswer);

// ========================================
// TEST ENDPOINT
// ========================================

router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Voice routes are working',
    endpoints: [
      'POST /api/voice/verify-answer - Verify spoken answer against correct answer'
    ]
  });
});

module.exports = router;
