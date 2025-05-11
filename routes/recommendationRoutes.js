// routes/recommendationRoutes.js
const express = require('express');
const router = express.Router();
const { getRecommendations } = require('../controllers/recommendationController');
const verifyToken = require('../middlewares/authMiddleware');

// ✅ Smart recommendations endpoint
router.get('/users/:userId/recommendations', verifyToken, getRecommendations);

module.exports = router;
