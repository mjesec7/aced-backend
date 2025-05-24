const UserProgress = require('../models/userProgress');

// ✅ Save or update user progress
exports.saveOrUpdateProgress = async (req, res) => {
  const {
    userId,
    lessonId,
    progressPercent = 0,
    completed = false,
    mistakes = 0,
    medal = 'none',
    duration = 0,
    stars = 0,
    points = 0,
    hintsUsed = 0
  } = req.body;

  if (!userId || !lessonId) {
    return res.status(400).json({ message: '❌ userId and lessonId are required.' });
  }

  try {
    const existing = await UserProgress.findOne({ userId, lessonId });

    if (existing) {
      existing.progressPercent = progressPercent;
      existing.completed = completed;
      existing.mistakes = mistakes;
      existing.medal = medal;
      existing.duration = duration;
      existing.stars = stars;
      existing.points = points;
      existing.hintsUsed = hintsUsed;
      await existing.save();

      return res.status(200).json({ message: '✅ Progress updated', data: existing });
    }

    const newProgress = new UserProgress({
      userId,
      lessonId,
      progressPercent,
      completed,
      mistakes,
      medal,
      duration,
      stars,
      points,
      hintsUsed
    });

    await newProgress.save();
    res.status(201).json({ message: '✅ Progress saved', data: newProgress });

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
    const progressRecords = await UserProgress.find({ userId });
    res.status(200).json({ message: '✅ User progress retrieved', data: progressRecords });
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
    const progress = await UserProgress.findOne({ userId, lessonId });

    if (!progress) {
      return res.status(404).json({ message: '⚠️ No progress found for this lesson.' });
    }

    res.status(200).json({ message: '✅ Lesson progress found', data: progress });
  } catch (error) {
    console.error('❌ Error retrieving lesson progress:', error);
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
    const avgScore = all.length ? totalPoints / all.length : 0;

    res.json({
      message: '✅ Analytics generated',
      data: {
        completedLessons: completedCount,
        totalPoints,
        totalStars,
        averageScore: avgScore.toFixed(1)
      }
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ message: '❌ Server error', error: error.message });
  }
};
