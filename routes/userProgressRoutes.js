const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middlewares/authMiddleware');
const controller = require('../controllers/userProgressController');

// ✅ Save or update progress for a lesson
router.post('/', verifyToken, controller.saveOrUpdateProgress);

// ✅ Get all progress for the authenticated user
router.get('/user/:userId', verifyToken, controller.getUserProgress);

// ✅ Get progress for a specific lesson
router.get('/user/:userId/lesson/:lessonId', verifyToken, controller.getLessonProgress);

// ✅ Get progress for a specific topic
router.get('/user/:userId/topic/:topicId', verifyToken, controller.getTopicProgress);

// ✅ Get all topics progress for a user
router.get('/user/:userId/topics', verifyToken, controller.getAllTopicsProgress);

// ✅ Mark a lesson as completed
router.patch('/user/:userId/lesson/:lessonId/complete', verifyToken, controller.markLessonCompleted);

// ✅ Get analytics summary for user
router.get('/user/:userId/analytics', verifyToken, controller.getUserAnalytics);

module.exports = router;