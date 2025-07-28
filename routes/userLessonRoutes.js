const express = require('express');
const router = express.Router();
const UserProgress = require('../models/userProgress');
const verifyToken = require('../middlewares/authMiddleware');

// ✅ GET /api/user/:firebaseId/lesson/:lessonId - Get user's progress for specific lesson
router.get('/:firebaseId/lesson/:lessonId', verifyToken, async (req, res) => {
  try {
    const { firebaseId, lessonId } = req.params;
    
    // Verify the requesting user matches the firebaseId
    if (req.user.uid !== firebaseId) {
      return res.status(403).json({ 
        error: '❌ Access denied: User mismatch' 
      });
    }
    
    const progress = await UserProgress.findOne({ 
      userId: firebaseId, 
      lessonId: lessonId 
    }).populate('lessonId', 'title description').populate('topicId', 'name description');
    
    // Return empty object if no progress found (instead of 404)
    // This matches what your frontend expects
    if (!progress) {
      return res.status(200).json({});
    }
    
    res.json(progress);
  } catch (error) {
    console.error('❌ Error fetching user lesson progress:', error);
    res.status(500).json({ 
      error: '❌ Error fetching lesson progress',
      details: error.message 
    });
  }
});

// ✅ POST /api/user/:firebaseId/lesson/:lessonId - Save progress for specific lesson
router.post('/:firebaseId/lesson/:lessonId', verifyToken, async (req, res) => {
  try {
    const { firebaseId, lessonId } = req.params;
    
    // Verify the requesting user matches the firebaseId
    if (req.user.uid !== firebaseId) {
      return res.status(403).json({ 
        error: '❌ Access denied: User mismatch' 
      });
    }
    
    const updateData = {
      ...req.body,
      userId: firebaseId,
      lessonId: lessonId,
      updatedAt: new Date()
    };
    
    const updated = await UserProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId },
      updateData,
      { upsert: true, new: true }
    );
    
    res.json(updated);
  } catch (error) {
    console.error('❌ Error saving user lesson progress:', error);
    res.status(500).json({ 
      error: '❌ Error saving lesson progress',
      details: error.message 
    });
  }
});
router.post('/:firebaseId/progress/save', verifyToken, async (req, res) => {
  try {
    const { firebaseId } = req.params;
    
    // Verify the requesting user matches the firebaseId
    if (req.user.uid !== firebaseId) {
      return res.status(403).json({ 
        error: '❌ Access denied: User mismatch' 
      });
    }
    
    const progressData = req.body;
    
    if (!progressData.lessonId) {
      return res.status(400).json({
        success: false,
        error: 'Missing lessonId in progress data'
      });
    }
    
    const updateData = {
      userId: firebaseId,
      lessonId: progressData.lessonId,
      topicId: progressData.topicId || null,
      completedSteps: progressData.completedSteps || [],
      progressPercent: progressData.progressPercent || 0,
      completed: progressData.completed || false,
      mistakes: progressData.mistakes || 0,
      medal: progressData.medal || 'none',
      duration: progressData.duration || 0,
      stars: progressData.stars || 0,
      points: progressData.points || 0,
      hintsUsed: progressData.hintsUsed || 0,
      submittedHomework: progressData.submittedHomework || false,
      updatedAt: new Date()
    };
    
    const updated = await UserProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId: progressData.lessonId },
      updateData,
      { upsert: true, new: true, runValidators: true }
    );
    
    
    res.json({
      success: true,
      data: updated,
      message: '✅ Progress saved',
      endpoint: 'userLessonRoutes/progress/save'
    });
    
  } catch (error) {
    console.error('❌ Error saving progress via userLessonRoutes:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Error saving lesson progress',
      details: error.message 
    });
  }
});
module.exports = router;