const express = require('express');
const router = express.Router();
const UserProgress = require('../models/userProgress');
const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const verifyToken = require('../middlewares/authMiddleware');

// ✅ POST /api/progress - Save or update progress
router.post('/', verifyToken, async (req, res) => {
  try {
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
      console.error('❌ Missing required fields:', { firebaseId, lessonId });
      return res.status(400).json({ 
        error: '❌ userId and lessonId are required.',
        message: '❌ userId and lessonId are required.' 
      });
    }

    // Handle topicId - it might be a string (topic name) or ObjectId
    let finalTopicId = null;

    if (topicId) {
      // Check if topicId is a valid ObjectId
      if (topicId.match && topicId.match(/^[0-9a-fA-F]{24}$/)) {
        finalTopicId = topicId;
      } else if (typeof topicId === 'string') {
        // If topicId is a string (like "Nouns"), try to find the topic by name
        try {
          // First try to get subject/level from the lesson
          const lesson = await Lesson.findById(lessonId);
          if (lesson) {
            const topic = await Topic.findOne({
              name: topicId,
              subject: lesson.subject,
              level: lesson.level
            });
            if (topic) {
              finalTopicId = topic._id;
              console.log(`✅ Resolved topicId from name "${topicId}" -> ${topic._id}`);
            } else {
              // If exact match not found, try just by name
              const topicByName = await Topic.findOne({ name: topicId });
              if (topicByName) {
                finalTopicId = topicByName._id;
                console.log(`✅ Resolved topicId from name (fallback) "${topicId}" -> ${topicByName._id}`);
              } else {
                console.warn(`⚠️ Could not find topic by name: "${topicId}"`);
              }
            }
          }
        } catch (error) {
          console.error(`❌ Error resolving topicId from name "${topicId}":`, error.message);
        }
      }
    }

    // If we still don't have topicId, try to get it from the lesson
    if (!finalTopicId && lessonId) {
      try {
        const lesson = await Lesson.findById(lessonId);
        if (lesson && lesson.topicId) {
          finalTopicId = lesson.topicId;
          console.log(`✅ Got topicId from lesson: ${finalTopicId}`);
        } else {
          console.warn(`⚠️ Lesson ${lessonId} does not have a topicId`);
        }
      } catch (error) {
        console.error(`❌ Error fetching lesson for topicId:`, error.message);
      }
    }

    const now = new Date();
    const updateData = {
      completedSteps,
      progressPercent: Math.min(100, Math.max(0, Number(progressPercent) || 0)),
      completed: Boolean(completed),
      mistakes: Math.max(0, Number(mistakes) || 0),
      medal: medal || 'none',
      duration: Math.max(0, Number(duration) || 0),
      stars: Math.min(3, Math.max(0, Number(stars) || 0)),
      points: Math.max(0, Number(points) || 0),
      hintsUsed: Math.max(0, Number(hintsUsed) || 0),
      submittedHomework: Boolean(submittedHomework),
      updatedAt: now,
      lastAccessedAt: now
    };

    // ✅ CRITICAL: Set completedAt when lesson is marked as completed
    if (completed) {
      updateData.completedAt = now;
    }

    // Only add topicId if we have a valid ObjectId
    if (finalTopicId) {
      updateData.topicId = finalTopicId;
    }

    console.log(`📊 Saving progress for user ${firebaseId}, lesson ${lessonId}:`, {
      completed: updateData.completed,
      progressPercent: updateData.progressPercent,
      points: updateData.points,
      stars: updateData.stars,
      topicId: finalTopicId || 'not resolved'
    });

    const updated = await UserProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId },
      updateData,
      { upsert: true, new: true, runValidators: true }
    );

    
    res.status(200).json({
      message: '✅ Progress saved/updated',
      data: updated
    });
    
  } catch (error) {
    console.error('❌ Error saving/updating progress:', error);
    res.status(500).json({ 
      error: '❌ Server error',
      message: '❌ Server error',
      details: error.message 
    });
  }
});

// ✅ GET /api/progress - Load progress
router.get('/', async (req, res) => {
  try {
    const { userId, lessonId } = req.query;
    
    if (!userId) {
      console.error('❌ Missing userId in query parameters');
      return res.status(400).json({ 
        error: '❌ userId is required as query parameter.',
        message: '❌ userId is required as query parameter.' 
      });
    }

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
    res.status(500).json({ 
      error: '❌ Server error',
      message: '❌ Server error',
      details: error.message 
    });
  }
});

// ✅ GET /api/progress/:userId/:lessonId - Get specific lesson progress
router.get('/:userId/:lessonId', async (req, res) => {
  try {
    const { userId, lessonId } = req.params;
    
    
    const progress = await UserProgress.findOne({ userId, lessonId })
      .populate('lessonId', 'title description order')
      .populate('topicId', 'title description order');
    
    if (!progress) {
      return res.status(200).json({ 
        message: '⚠️ No progress found for this lesson.',
        data: null 
      });
    }

    res.status(200).json({ 
      message: '✅ Lesson progress found', 
      data: progress 
    });
  } catch (error) {
    console.error('❌ Error retrieving lesson progress:', error);
    res.status(500).json({ 
      error: '❌ Server error',
      message: '❌ Server error',
      details: error.message 
    });
  }
});

// ✅ DELETE /api/progress/:userId/:lessonId - Reset lesson progress
router.delete('/:userId/:lessonId', verifyToken, async (req, res) => {
  try {
    const { userId, lessonId } = req.params;
    
    // Verify user owns this progress
    if (req.user.uid !== userId) {
      return res.status(403).json({ 
        error: '❌ Access denied',
        message: '❌ Access denied' 
      });
    }
    
    const deleted = await UserProgress.findOneAndDelete({ userId, lessonId });
    
    if (!deleted) {
      return res.status(404).json({ 
        message: '⚠️ No progress found to delete.' 
      });
    }

    res.status(200).json({ 
      message: '✅ Progress reset successfully' 
    });
  } catch (error) {
    console.error('❌ Error deleting progress:', error);
    res.status(500).json({ 
      error: '❌ Server error',
      message: '❌ Server error',
      details: error.message 
    });
  }
});

module.exports = router;