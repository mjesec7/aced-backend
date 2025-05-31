const UserProgress = require('../models/userProgress');

// ✅ Load progress (for frontend calling /api/progress)
exports.loadProgress = async (req, res) => {
  // Extract userId from query params or token
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
};

// ✅ Save or update user progress
exports.saveOrUpdateProgress = async (req, res) => {
  const {
    userId,
    lessonId,
    topicId, // Added topicId support
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

  if (!userId || !lessonId) {
    return res.status(400).json({ message: '❌ userId and lessonId are required.' });
  }

  // If topicId is not provided, try to get it from the lesson
  let finalTopicId = topicId;
  if (!finalTopicId && lessonId) {
    try {
      const Lesson = require('../models/lesson'); // Assuming you have a Lesson model
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
      { userId, lessonId },
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
};

// ✅ Get all progress records for a specific user
exports.getUserProgress = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ message: '❌ userId is required.' });
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
};

// ✅ Get progress for a specific lesson
exports.getLessonProgress = async (req, res) => {
  const { userId, lessonId } = req.params;

  if (!userId || !lessonId) {
    return res.status(400).json({ message: '❌ userId and lessonId are required.' });
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
};

// ✅ Get progress for a specific topic
exports.getTopicProgress = async (req, res) => {
  const { userId, topicId } = req.params;

  if (!userId || !topicId) {
    return res.status(400).json({ message: '❌ userId and topicId are required.' });
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
};

// ✅ Get all topics progress for a user
exports.getAllTopicsProgress = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ message: '❌ userId is required.' });
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
};

// ✅ Mark a lesson as completed
exports.markLessonCompleted = async (req, res) => {
  const { userId, lessonId } = req.params;

  if (!userId || !lessonId) {
    return res.status(400).json({ message: '❌ userId and lessonId are required.' });
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
};

// ✅ Get summary analytics for a user
exports.getUserAnalytics = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ message: '❌ userId is required.' });
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
};