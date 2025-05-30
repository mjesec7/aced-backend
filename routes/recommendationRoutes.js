const express = require('express');
const router = express.Router();
const { getRecommendations } = require('../controllers/recommendationController');
const verifyToken = require('../middlewares/authMiddleware');

// ✅ Middleware: Ensure the Firebase ID in token matches route param
function verifyOwnership(req, res, next) {
  if (!req.user || req.user.uid !== req.params.firebaseId) {
    return res.status(403).json({ error: '❌ Access denied: User mismatch' });
  }
  next();
}

// ✅ GET smart recommendations for a user
router.get('/users/:firebaseId/recommendations', verifyToken, verifyOwnership, getRecommendations);

module.exports = router;
