const express = require('express');
const router = express.Router();

// Fix the import - remove destructuring since it's causing undefined
const verifyToken = require('../middlewares/authMiddleware');
const controller = require('../controllers/homeworkController');

// Add error handling for missing middleware
if (!verifyToken) {
  console.error('❌ verifyToken middleware is undefined');
  module.exports = router;
  return;
}

// Add error handling for missing controller functions
if (!controller || !controller.getAllHomeworks || !controller.getHomeworkByLesson || !controller.saveHomework || !controller.submitHomework) {
  console.error('❌ One or more controller functions are undefined:', {
    controller: !!controller,
    getAllHomeworks: !!(controller && controller.getAllHomeworks),
    getHomeworkByLesson: !!(controller && controller.getHomeworkByLesson),
    saveHomework: !!(controller && controller.saveHomework),
    submitHomework: !!(controller && controller.submitHomework)
  });
  module.exports = router;
  return;
}

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