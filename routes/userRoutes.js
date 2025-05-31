const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// ✅ Models
const User = require('../models/user');
const TopicProgress = require('../models/topicProgress');
const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const UserProgress = require('../models/userProgress');

// ✅ Firebase & Middleware
const admin = require('../config/firebase');
const verifyToken = require('../middlewares/authMiddleware');

// ✅ Controllers
const homeworkController = require('../controllers/homeworkController');
const testController = require('../controllers/testController');
const userProgressController = require('../controllers/userProgressController');

console.log('✅ userRoutes.js loaded');

// Middleware
function validateFirebaseId(req, res, next) {
  if (!req.params.firebaseId) return res.status(400).json({ error: '❌ Missing firebaseId' });
  next();
}

function verifyOwnership(req, res, next) {
  if (!req.user || req.user.uid !== req.params.firebaseId)
    return res.status(403).json({ error: '❌ Access denied: User mismatch' });
  next();
}

function validateObjectId(req, res, next) {
  const { id } = req.params;
  if (id && !mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ error: '❌ Invalid ObjectId' });
  next();
}

// Auth Save
router.post('/save', async (req, res) => {
  const { token, name, subscriptionPlan } = req.body;
  if (!token || !name) return res.status(400).json({ error: '❌ Missing token or name' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const firebaseId = decoded.uid;
    const email = decoded.email;

    let user = await User.findOne({ firebaseId });
    if (!user) {
      user = new User({ firebaseId, email, name, subscriptionPlan: subscriptionPlan || 'free' });
    } else {
      user.email = email;
      user.name = name;
      if (subscriptionPlan) user.subscriptionPlan = subscriptionPlan;
    }

    await user.save();
    res.json(user);
  } catch (err) {
    console.error('❌ Firebase token invalid:', err.message);
    res.status(401).json({ error: '❌ Invalid Firebase token' });
  }
});

// Info
router.get('/:firebaseId', validateFirebaseId, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json(user);
  } catch {
    res.status(500).json({ error: '❌ Server error' });
  }
});

router.get('/:firebaseId/status', validateFirebaseId, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json({ status: user.subscriptionPlan || 'free' });
  } catch {
    res.status(500).json({ error: '❌ Server error' });
  }
});

// Study List
router.get('/:firebaseId/study-list', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json(user.studyList || []);
  } catch {
    res.status(500).json({ error: '❌ Error fetching study list' });
  }
});

router.post('/:firebaseId/study-list', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { subject, level, topic, topicId } = req.body;
  if (!subject || !topic) return res.status(400).json({ error: '❌ Missing subject or topic' });
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });

    const exists = user.studyList?.some(entry => entry.name === topic && entry.subject === subject);
    if (!exists) {
      user.studyList.push({ name: topic, subject, level, topicId: topicId || null });
      await user.save();
    }
    res.json(user.studyList);
  } catch {
    res.status(500).json({ error: '❌ Error saving study list' });
  }
});

router.delete('/:firebaseId/study-list/:topicId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    user.studyList = user.studyList.filter(entry =>
      entry.topicId?.toString() !== req.params.topicId && entry._id?.toString() !== req.params.topicId
    );
    await user.save();
    res.json({ message: '✅ Removed', studyList: user.studyList });
  } catch {
    res.status(500).json({ error: '❌ Error removing topic' });
  }
});

// ✅ NEW: User Progress Routes (using new controller)
router.get('/:firebaseId/progress', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  // Transform firebaseId to userId for the controller
  req.params.userId = req.params.firebaseId;
  return userProgressController.getUserProgress(req, res);
});

router.get('/:firebaseId/progress/lesson/:lessonId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  // Transform firebaseId to userId for the controller
  req.params.userId = req.params.firebaseId;
  return userProgressController.getLessonProgress(req, res);
});

router.get('/:firebaseId/progress/topic/:topicId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  // Transform firebaseId to userId for the controller
  req.params.userId = req.params.firebaseId;
  return userProgressController.getTopicProgress(req, res);
});

router.get('/:firebaseId/progress/topics', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  // Transform firebaseId to userId for the controller
  req.params.userId = req.params.firebaseId;
  return userProgressController.getAllTopicsProgress(req, res);
});

// Lesson Progress (keeping existing for backward compatibility)
router.post('/:firebaseId/progress', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { lessonId, section } = req.body;
  if (!lessonId || !section) return res.status(400).json({ error: '❌ Missing lessonId or section' });
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    user.progress ||= {};
    user.progress[lessonId] ||= {};
    user.progress[lessonId][section] = true;
    await user.save();
    res.json(user.progress[lessonId]);
  } catch {
    res.status(500).json({ error: '❌ Error saving progress' });
  }
});

// Topic Progress
router.post('/:firebaseId/progress-topic', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { topicId } = req.body;
  if (!topicId) return res.status(400).json({ error: '❌ Missing topicId' });
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    let progress = await TopicProgress.findOne({ userId: user._id, topicId });
    if (!progress) {
      const totalLessons = await Lesson.countDocuments({ topic: topicId });
      progress = new TopicProgress({ userId: user._id, topicId, totalLessons, completedLessons: 0, percent: 0, medal: 'none' });
    }
    progress.completedLessons++;
    progress.percent = progress.totalLessons > 0 ? (progress.completedLessons / progress.totalLessons) * 100 : 0;
    progress.medal = progress.percent >= 90 ? 'gold' : progress.percent >= 70 ? 'silver' : progress.percent >= 50 ? 'bronze' : 'none';
    await progress.save();
    res.json(progress);
  } catch {
    res.status(500).json({ error: '❌ Error updating topic progress' });
  }
});

// Analytics
router.get('/:firebaseId/analytics', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const progress = await UserProgress.find({ userId: req.params.firebaseId });
    const completed = progress.filter(p => p.completed).length;
    const totalStars = progress.reduce((sum, p) => sum + (p.stars || 0), 0);
    const totalPoints = progress.reduce((sum, p) => sum + (p.points || 0), 0);
    const hintsUsed = progress.reduce((sum, p) => sum + (p.hintsUsed || 0), 0);
    res.json({ completedLessons: completed, totalStars, totalPoints, hintsUsed });
  } catch {
    res.status(500).json({ error: '❌ Error fetching analytics' });
  }
});

router.get('/:firebaseId/points', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const progress = await UserProgress.find({ userId: req.params.firebaseId });
    const totalPoints = progress.reduce((sum, p) => sum + (p.points || 0), 0);
    res.json({ totalPoints });
  } catch {
    res.status(500).json({ error: '❌ Error fetching points' });
  }
});

// Diary
router.get('/:firebaseId/diary', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json(user.diary || []);
  } catch (error) {
    console.error('❌ Diary fetch error:', error);
    res.status(500).json({ error: '❌ Error fetching diary' });
  }
});

router.post('/:firebaseId/diary', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { date, studyMinutes, completedTopics, averageGrade } = req.body;
  if (!date || studyMinutes == null || completedTopics == null || averageGrade == null)
    return res.status(400).json({ error: '❌ Invalid diary data' });
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    user.diary ||= [];
    user.diary.push({ date, studyMinutes, completedTopics, averageGrade });
    await user.save();
    res.status(201).json({ message: '✅ Saved diary entry' });
  } catch (error) {
    console.error('❌ Diary save error:', error);
    res.status(500).json({ error: '❌ Error saving diary' });
  }
});

// Homework
router.get('/:firebaseId/homeworks', validateFirebaseId, verifyToken, verifyOwnership, homeworkController.getAllHomeworks);
router.get('/:firebaseId/homeworks/lesson/:lessonId', validateFirebaseId, verifyToken, verifyOwnership, homeworkController.getHomeworkByLesson);
router.post('/:firebaseId/homeworks/save', validateFirebaseId, verifyToken, verifyOwnership, homeworkController.saveHomework);
router.post('/:firebaseId/homeworks/lesson/:lessonId/submit', validateFirebaseId, verifyToken, verifyOwnership, homeworkController.submitHomework);

// Tests
router.get('/:firebaseId/tests', validateFirebaseId, verifyToken, verifyOwnership, testController.getAvailableTests);
router.get('/:firebaseId/tests/:testId', validateFirebaseId, verifyToken, verifyOwnership, testController.getTestById);
router.post('/:firebaseId/tests/:testId/submit', validateFirebaseId, verifyToken, verifyOwnership, testController.submitTestResult);
router.get('/:firebaseId/tests/:testId/result', validateFirebaseId, verifyToken, verifyOwnership, testController.getTestResult);

module.exports = router;