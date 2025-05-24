const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const testController = require('../controllers/testController');

// 🔍 List all available tests for the user (e.g., by subject or topic)
router.get('/:firebaseId', verifyToken, testController.getAvailableTests);

// 🔍 Get a specific test by ID
router.get('/:firebaseId/:testId', verifyToken, testController.getTestById);

// 📝 Submit test results
router.post('/:firebaseId/:testId/submit', verifyToken, testController.submitTestResult);

// 📊 Get test result details (score, feedback, etc.)
router.get('/:firebaseId/:testId/result', verifyToken, testController.getTestResult);

module.exports = router;
