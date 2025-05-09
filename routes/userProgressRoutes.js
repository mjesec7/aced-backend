const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const userProgressController = require('../controllers/userProgressController');

// ✅ Save or update progress (Requires auth)
router.post('/', verifyToken, userProgressController.saveOrUpdateProgress);

// ✅ Get all progress for a specific user (Requires auth)
router.get('/user/:userId', verifyToken, userProgressController.getUserProgress);

// ✅ Get specific lesson progress for user (Requires auth)
router.get('/user/:userId/lesson/:lessonId', verifyToken, userProgressController.getLessonProgress);

module.exports = router;
