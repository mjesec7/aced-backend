const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const controller = require('../controllers/homeworkController');

// 🧠 Middleware to check if the user matches the token
function checkUserMatch(req, res, next) {
  if (req.user.uid !== req.params.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

// 📥 GET /users/:userId/homeworks
// Get all homework progress records for a user
router.get(
  '/users/:userId/homeworks',
  verifyToken,
  checkUserMatch,
  controller.getAllHomeworks
);

// 📥 GET /users/:userId/homeworks/lesson/:lessonId
// Get homework progress for a specific lesson
router.get(
  '/users/:userId/homeworks/lesson/:lessonId',
  verifyToken,
  checkUserMatch,
  controller.getHomeworkByLesson
);

// 📤 POST /users/:userId/homeworks
// Save or update in-progress or submitted homework
router.post(
  '/users/:userId/homeworks',
  verifyToken,
  checkUserMatch,
  controller.saveHomework
);

// ✅ POST /users/:userId/homeworks/lesson/:lessonId/submit
// Submit and auto-grade homework for a specific lesson
router.post(
  '/users/:userId/homeworks/lesson/:lessonId/submit',
  verifyToken,
  checkUserMatch,
  controller.submitHomework
);

module.exports = router;
