const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const UserProgress = require('../models/userProgress');
const Lesson = require('../models/lesson');
const verifyToken = require('../middlewares/authMiddleware');

// ========================================
// 🎯 USER LESSON PROGRESS ROUTES
// ========================================

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

// ✅ POST /api/user/:firebaseId/progress/save
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

// ========================================
// 🆕 ADDITIONAL USER-PROGRESS ROUTES FROM SERVER.JS
// ========================================

// ✅ GET /api/user-progress/user/:userId/lesson/:lessonId
router.get('/user-progress/user/:userId/lesson/:lessonId', async (req, res) => {
  try {
    const { userId, lessonId } = req.params;

    // Basic validation
    if (!userId || !lessonId) {
      return res.status(400).json({
        success: false,
        error: 'userId and lessonId are required'
      });
    }

    // Find progress
    const progress = await UserProgress.findOne({
      userId: userId,
      lessonId: lessonId
    }).populate('lessonId', 'title description order')
      .populate('topicId', 'title description order');

    res.json({
      success: true,
      data: progress || null,
      message: progress ? '✅ Progress found' : '⚠️ No progress found for this lesson'
    });

  } catch (error) {
    console.error('❌ Error in user-progress lesson route:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching lesson progress',
      details: error.message
    });
  }
});

// ✅ POST /api/user-progress/user/:userId/lesson/:lessonId
router.post('/user-progress/user/:userId/lesson/:lessonId', async (req, res) => {
  try {
    const { userId, lessonId } = req.params;
    const progressData = req.body;

    // Basic validation
    if (!userId || !lessonId) {
      return res.status(400).json({
        success: false,
        error: 'userId and lessonId are required'
      });
    }

    // Get topicId from lesson if not provided
    let finalTopicId = progressData.topicId;
    if (!finalTopicId) {
      try {
        const lesson = await Lesson.findById(lessonId);
        if (lesson && lesson.topicId) {
          finalTopicId = lesson.topicId;
        }
      } catch (lessonError) {
        console.warn('⚠️ Failed to find lesson to get topicId:', lessonError.message);
      }
    }

    const updateData = {
      userId: userId,
      lessonId: lessonId,
      topicId: finalTopicId,
      completedSteps: progressData.completedSteps || [],
      progressPercent: Math.min(100, Math.max(0, Number(progressData.progressPercent) || 0)),
      completed: Boolean(progressData.completed),
      mistakes: Math.max(0, Number(progressData.mistakes) || 0),
      medal: String(progressData.medal || 'none'),
      duration: Math.max(0, Number(progressData.duration) || 0),
      stars: Math.min(5, Math.max(0, Number(progressData.stars) || 0)),
      points: Math.max(0, Number(progressData.points) || 0),
      hintsUsed: Math.max(0, Number(progressData.hintsUsed) || 0),
      submittedHomework: Boolean(progressData.submittedHomework),
      updatedAt: new Date()
    };

    // Remove null/undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === null || updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const updated = await UserProgress.findOneAndUpdate(
      { userId: userId, lessonId: lessonId },
      updateData,
      { upsert: true, new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: updated,
      message: '✅ Progress saved successfully'
    });

  } catch (error) {
    console.error('❌ Error in user-progress/user/lesson route:', error);

    if (error.name === 'CastError') {
      res.status(400).json({
        success: false,
        error: 'Invalid data format',
        field: error.path,
        value: error.value
      });
    } else if (error.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: Object.values(error.errors).map(e => e.message)
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Error saving progress',
        details: error.message
      });
    }
  }
});

// ✅ GET /api/user-progress (for general user progress queries)
router.get('/user-progress', async (req, res) => {
  try {
    const { userId, lessonId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required as query parameter'
      });
    }

    if (lessonId) {
      // Get specific lesson progress
      const progress = await UserProgress.findOne({ userId, lessonId })
        .populate('lessonId', 'title description order')
        .populate('topicId', 'title description order');

      return res.json({
        success: true,
        data: progress || null,
        message: progress ? '✅ Progress found' : '⚠️ No progress found'
      });
    } else {
      // Get all progress for user
      const progressRecords = await UserProgress.find({ userId })
        .populate('lessonId', 'title description order')
        .populate('topicId', 'title description order')
        .sort({ updatedAt: -1 });

      return res.json({
        success: true,
        data: progressRecords,
        message: '✅ All progress loaded'
      });
    }

  } catch (error) {
    console.error('❌ Error in user-progress general route:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching progress',
      details: error.message
    });
  }
});

module.exports = router;