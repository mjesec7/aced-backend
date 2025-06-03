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

// Add debugging middleware
router.use((req, res, next) => {
  console.log('🔍 Homework route hit:', req.method, req.originalUrl);
  console.log('🔍 Params:', req.params);
  next();
});

// ─────────────────────────────────────────────────────────────
// 📥 GET /user/:firebaseId - FIXED ROUTE PATH
// ✅ Get all homework records for the current user
router.get(
  '/user/:firebaseId',
  verifyToken,
  checkUserMatch,
  controller.getAllHomeworks
);

// 📥 GET /user/:firebaseId/lesson/:lessonId - FIXED ROUTE PATH
// ✅ Get homework for a specific lesson
router.get(
  '/user/:firebaseId/lesson/:lessonId',
  verifyToken,
  checkUserMatch,
  controller.getHomeworkByLesson
);

// 📤 POST /user/:firebaseId/save - FIXED ROUTE PATH
// ✅ Save or update homework answers (draft or final)
router.post(
  '/user/:firebaseId/save',
  verifyToken,
  checkUserMatch,
  controller.saveHomework
);

// 🧠 POST /user/:firebaseId/lesson/:lessonId/submit - FIXED ROUTE PATH
// ✅ Submit and auto-grade homework
router.post(
  '/user/:firebaseId/lesson/:lessonId/submit',
  verifyToken,
  checkUserMatch,
  controller.submitHomework
);

module.exports = router;