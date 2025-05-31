const express = require('express');
const router = express.Router();
const UserProgress = require('../models/userProgress');
const Lesson = require('../models/lesson');
const verifyToken = require('../middlewares/authMiddleware');

// ✅ GET /api/progress - Load progress
router.get('/', async (req, res) => {
  // Extract userId from query params
  const { userId, lessonId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ message: '❌ userId is required as query parameter.' });
  }

  try {
    if (lessonId) {
      // Load specific lesson progress
      const progress = await UserProgress.findOne({ userId, lessonId })
        .populate('lessonId', 'title description order')
        .populate('topicId', 'title description order');
      
      return res.status(200).json({
        message: '✅ Progress loaded',
        data: progress || null
      });
    } else {
      // Load all progress for user
      const progressRecords = await UserProgress.find({ userId })
        .populate('lessonId', 'title description order')
        .populate('topicId', 'title description order')
        .sort({ updatedAt: -1 });

      return res.status(200).json({
        message: '✅ All progress loaded',
        data: progressRecords
      });
    }
  } catch (error) {
    console.error('❌ Error loading progress:', error);
    res.status(500).json({ message: '❌ Server error', error: error.message });
  }
});

// ✅ POST /api/progress - Save or update user progress
router.post('/', verifyToken, async (req, res) => {
  const {
    userId,
    lessonId,
    topicId,
    completedSteps = [],
    progressPercent = 0,
    completed = false,
    mistakes = 0,
    medal = 'none',
    duration = 0,
    stars = 0,
    points = 0,
    hintsUsed = 0,
    submittedHomework = false
  } = req.body;

  // Use Firebase UID from token if userId not provided
  const firebaseId = userId || req.user?.uid;

  if (!firebaseId || !lessonId) {
    return res.status(400).json({ message: '❌ userId and lessonId are required.' });
  }

  // If topicId is not provided, try to get it from the lesson
  let finalTopicId = topicId;
  if (!finalTopicId && lessonId) {
    try {
      const lesson = await Lesson.findById(lessonId);
      if (lesson && lesson.topicId) {
        finalTopicId = lesson.topicId;
      }
    } catch (error) {
      console.warn('⚠️ Could not fetch topicId from lesson:', error.message);
    }
  }

  try {
    const updateData = {
      completedSteps,
      progressPercent,
      completed,
      mistakes,
      medal,
      duration,
      stars,
      points,
      hintsUsed,
      submittedHomework,
      updatedAt: new Date()
    };

    // Add topicId if available
    if (finalTopicId) {
      updateData.topicId = finalTopicId;
    }

    const updated = await UserProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId },
      updateData,
      { upsert: true, new: true }
    );

    res.status(200).json({
      message: '✅ Progress saved/updated',
      data: updated
    });
  } catch (error) {
    console.error('❌ Error saving/updating progress:', error);
    res.status(500).json({ message: '❌ Server error', error: error.message });
  }
});

// ✅ GET /api/progress/:userId - Get all progress records for a specific user
router.get('/:userId', verifyToken, async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ message: '❌ userId is required.' });
  }

  // Verify user can only access their own progress
  if (req.user.uid !== userId) {
    return res.status(403).json({ message: '❌ Access denied' });
  }

  try {
    const progressRecords = await UserProgress.find({ userId })
      .populate('lessonId', 'title description order')
      .populate('topicId', 'title description order')
      .sort({ updatedAt: -1 });

    res.status(200).json({ 
      message: '✅ User progress retrieved', 
      data: progressRecords 
    });
  } catch (error) {
    console.error('❌ Error retrieving user progress:', error);
    res.status(500).json({ message: '❌ Server error', error: error.message });
  }
});

// ✅ GET /api/progress/:userId/lesson/:lessonId - Get progress for a specific lesson
router.get('/:userId/lesson/:lessonId', verifyToken, async (req, res) => {
  const { userId, lessonId } = req.params;

  if (!userId || !lessonId) {
    return res.status(400).json({ message: '❌ userId and lessonId are required.' });
  }

  // Verify user can only access their own progress
  if (req.user.uid !== userId) {
    return res.status(403).json({ message: '❌ Access denied' });
  }

  try {
    const progress = await UserProgress.findOne({ userId, lessonId })
      .populate('lessonId', 'title description order')
      .populate('topicId', 'title description order');

    if (!progress) {
      return res.status(404).json({ message: '⚠️ No progress found for this lesson.' });
    }

    res.status(200).json({ 
      message: '✅ Lesson progress found', 
      data: progress 
    });
  } catch (error) {
    console.error('❌ Error retrieving lesson progress:', error);
    res.status(500).json({ message: '❌ Server error', error: error.message });
  }
});

// ✅ GET /api/progress/:userId/topic/:topicId - Get progress for a specific topic
router.get('/:userId/topic/:topicId', verifyToken, async (req, res) => {
  const { userId, topicId } = req.params;

  if (!userId || !topicId) {
    return res.status(400).json({ message: '❌ userId and topicId are required.' });
  }

  // Verify user can only access their own progress
  if (req.user.uid !== userId) {
    return res.status(403).json({ message: '❌ Access denied' });
  }

  try {
    // Get detailed progress for all lessons in this topic
    const lessonProgress = await UserProgress.find({ userId, topicId })
      .populate('lessonId', 'title description order')
      .sort({ 'lessonId.order': 1 });

    // Calculate overall topic progress using the static method
    const overallProgress = await UserProgress.calculateTopicProgress(userId, topicId);

    res.status(200).json({
      message: '✅ Topic progress retrieved',
      data: {
        topicId,
        overallProgress,
        lessons: lessonProgress,
        totalLessons: lessonProgress.length,
        completedLessons: lessonProgress.filter(p => p.completed).length
      }
    });
  } catch (error) {
    console.error('❌ Error retrieving topic progress:', error);
    res.status(500).json({ message: '❌ Server error', error: error.message });
  }
});

// ✅ GET /api/progress/:userId/topics - Get all topics progress for a user
router.get('/:userId/topics', verifyToken, async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ message: '❌ userId is required.' });
  }

  // Verify user can only access their own progress
  if (req.user.uid !== userId) {
    return res.status(403).json({ message: '❌ Access denied' });
  }

  try {
    // Use the static method to get all topic progress
    const topicsProgress = await UserProgress.getAllTopicProgress(userId);

    res.status(200).json({
      message: '✅ All topics progress retrieved',
      data: topicsProgress
    });
  } catch (error) {
    console.error('❌ Error retrieving all topics progress:', error);
    res.status(500).json({ message: '❌ Server error', error: error.message });
  }
});

// ✅ PUT /api/progress/:userId/lesson/:lessonId/complete - Mark a lesson as completed
router.put('/:userId/lesson/:lessonId/complete', verifyToken, async (req, res) => {
  const { userId, lessonId } = req.params;

  if (!userId || !lessonId) {
    return res.status(400).json({ message: '❌ userId and lessonId are required.' });
  }

  // Verify user can only update their own progress
  if (req.user.uid !== userId) {
    return res.status(403).json({ message: '❌ Access denied' });
  }

  try {
    const progress = await UserProgress.findOne({ userId, lessonId });

    if (!progress) {
      return res.status(404).json({ message: '⚠️ No progress record found for this lesson.' });
    }

    // Use the instance method to mark as completed
    await progress.markCompleted();

    res.status(200).json({
      message: '✅ Lesson marked as completed',
      data: progress
    });
  } catch (error) {
    console.error('❌ Error marking lesson as completed:', error);
    res.status(500).json({ message: '❌ Server error', error: error.message });
  }
});

// ✅ GET /api/progress/:userId/analytics - Get summary analytics for a user
router.get('/:userId/analytics', verifyToken, async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ message: '❌ userId is required.' });
  }

  // Verify user can only access their own analytics
  if (req.user.uid !== userId) {
    return res.status(403).json({ message: '❌ Access denied' });
  }

  try {
    const all = await UserProgress.find({ userId });

    const completedCount = all.filter(p => p.completed).length;
    const totalPoints = all.reduce((sum, p) => sum + (p.points || 0), 0);
    const totalStars = all.reduce((sum, p) => sum + (p.stars || 0), 0);
    const totalDuration = all.reduce((sum, p) => sum + (p.duration || 0), 0);
    const totalHints = all.reduce((sum, p) => sum + (p.hintsUsed || 0), 0);
    const totalMistakes = all.reduce((sum, p) => sum + (p.mistakes || 0), 0);
    const avgScore = all.length ? +(totalPoints / all.length).toFixed(1) : 0;
    const homeworkSubmitted = all.filter(p => p.submittedHomework).length;

    // Medal distribution
    const medalCounts = {
      gold: all.filter(p => p.medal === 'gold').length,
      silver: all.filter(p => p.medal === 'silver').length,
      bronze: all.filter(p => p.medal === 'bronze').length,
      none: all.filter(p => p.medal === 'none').length
    };

    // Get topics progress
    const topicsProgress = await UserProgress.getAllTopicProgress(userId);
    const completedTopics = Object.values(topicsProgress).filter(progress => progress === 100).length;

    res.json({
      message: '✅ Analytics generated',
      data: {
        totalLessons: all.length,
        completedLessons: completedCount,
        completedTopics,
        totalPoints,
        totalStars,
        totalHints,
        totalMistakes,
        totalDuration,
        homeworkSubmitted,
        averageScore: avgScore,
        medalDistribution: medalCounts,
        topicsProgress
      }
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ message: '❌ Server error', error: error.message });
  }
});

// ✅ DELETE /api/progress/:userId/lesson/:lessonId - Delete progress for a lesson
router.delete('/:userId/lesson/:lessonId', verifyToken, async (req, res) => {
  const { userId, lessonId } = req.params;

  if (!userId || !lessonId) {
    return res.status(400).json({ message: '❌ userId and lessonId are required.' });
  }

  // Verify user can only delete their own progress
  if (req.user.uid !== userId) {
    return res.status(403).json({ message: '❌ Access denied' });
  }

  try {
    const deleted = await UserProgress.findOneAndDelete({ userId, lessonId });

    if (!deleted) {
      return res.status(404).json({ message: '⚠️ No progress found to delete.' });
    }

    res.status(200).json({
      message: '✅ Progress deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting progress:', error);
    res.status(500).json({ message: '❌ Server error', error: error.message });
  }
});

module.exports = router;