const express = require('express');
const router = express.Router();

// Fix the import - remove destructuring since it's causing undefined
const verifyToken = require('../middlewares/authMiddleware');
const controller = require('../controllers/homeworkController');

// Import models for cleanup route
const HomeworkProgress = require('../models/HomeworkProgress');
const Lesson = require('../models/Lesson');

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

// 🧹 POST /cleanup - Clean up homework records with invalid lesson references
// ✅ Remove homework records that reference non-existent lessons
router.post(
  '/cleanup',
  verifyToken,
  async (req, res) => {
    try {
      console.log('🧹 Starting homework cleanup...');
      
      // Get all homework records
      const allHomework = await HomeworkProgress.find({});
      console.log(`📊 Found ${allHomework.length} total homework records`);
      
      const invalidHomework = [];
      const validHomework = [];
      
      // Check each homework record
      for (const hw of allHomework) {
        try {
          // Check if the lesson exists
          const lessonExists = await Lesson.exists({ _id: hw.lessonId });
          
          if (lessonExists) {
            validHomework.push(hw._id);
          } else {
            invalidHomework.push({
              id: hw._id,
              lessonId: hw.lessonId,
              userId: hw.userId
            });
          }
        } catch (error) {
          // If there's an error checking (e.g., invalid ObjectId), mark as invalid
          invalidHomework.push({
            id: hw._id,
            lessonId: hw.lessonId,
            userId: hw.userId,
            error: error.message
          });
        }
      }
      
      console.log(`✅ Valid homework records: ${validHomework.length}`);
      console.log(`❌ Invalid homework records: ${invalidHomework.length}`);
      
      // Delete invalid homework records
      if (invalidHomework.length > 0) {
        const idsToDelete = invalidHomework.map(hw => hw.id);
        const deleteResult = await HomeworkProgress.deleteMany({
          _id: { $in: idsToDelete }
        });
        
        console.log(`🗑️ Deleted ${deleteResult.deletedCount} invalid homework records`);
      }
      
      res.status(200).json({
        message: '✅ Homework cleanup completed',
        data: {
          totalRecords: allHomework.length,
          validRecords: validHomework.length,
          invalidRecords: invalidHomework.length,
          deletedRecords: invalidHomework.length,
          invalidDetails: invalidHomework
        }
      });
      
    } catch (error) {
      console.error('❌ Error during homework cleanup:', error);
      res.status(500).json({ 
        error: '❌ Server error during cleanup',
        message: error.message 
      });
    }
  }
);

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