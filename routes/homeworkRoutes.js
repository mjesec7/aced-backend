const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middlewares/authMiddleware');
const controller = require('../controllers/homeworkController');

// 🧠 Ensure Firebase token matches requested user
function checkUserMatch(req, res, next) {
  if (!req.user || req.user.uid !== req.params.firebaseId) {
    console.warn(`⚠️ Access denied for user: ${req.user?.uid} vs ${req.params.firebaseId}`);
    return res.status(403).json({ error: '❌ Access denied: user mismatch' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────
// 📥 GET /:firebaseId/homeworks
// ✅ Get all homework records for the current user
router.get(
  '/:firebaseId/homeworks',
  verifyToken,
  checkUserMatch,
  controller.getAllHomeworks
);

// 📥 GET /:firebaseId/homeworks/lesson/:lessonId
// ✅ Get homework for a specific lesson
router.get(
  '/:firebaseId/homeworks/lesson/:lessonId',
  verifyToken,
  checkUserMatch,
  controller.getHomeworkByLesson
);

// 📤 POST /:firebaseId/homeworks/save
// ✅ Save or update homework answers (draft or final)
router.post(
  '/:firebaseId/homeworks/save',
  verifyToken,
  checkUserMatch,
  controller.saveHomework
);

// 🧠 POST /:firebaseId/homeworks/lesson/:lessonId/submit
// ✅ Submit and auto-grade homework
router.post(
  '/:firebaseId/homeworks/lesson/:lessonId/submit',
  verifyToken,
  checkUserMatch,
  controller.submitHomework
);

module.exports = router;
