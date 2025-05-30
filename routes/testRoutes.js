const express = require('express');
const router = express.Router();

const verifyToken = require('../middlewares/authMiddleware');
const testController = require('../controllers/testController');

// 🧠 Middleware to ensure the Firebase ID in token matches the route param
function checkUserMatch(req, res, next) {
  if (!req.user || req.user.uid !== req.params.firebaseId) {
    console.warn(`⚠️ Access denied: token uid = ${req.user?.uid}, param = ${req.params.firebaseId}`);
    return res.status(403).json({ error: '❌ Access denied: user mismatch' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────
// 📋 [GET] /:firebaseId
// ✅ List all available tests (filtered by subject/topic if needed)
router.get(
  '/:firebaseId',
  verifyToken,
  checkUserMatch,
  testController.getAvailableTests
);

// 🧪 [GET] /:firebaseId/:testId
// ✅ Get a specific test by ID (questions, metadata)
router.get(
  '/:firebaseId/:testId',
  verifyToken,
  checkUserMatch,
  testController.getTestById
);

// 📝 [POST] /:firebaseId/:testId/submit
// ✅ Submit a user's answers and receive a result
router.post(
  '/:firebaseId/:testId/submit',
  verifyToken,
  checkUserMatch,
  testController.submitTestResult
);

// 📊 [GET] /:firebaseId/:testId/result
// ✅ Retrieve the result of a completed test
router.get(
  '/:firebaseId/:testId/result',
  verifyToken,
  checkUserMatch,
  testController.getTestResult
);

module.exports = router;
