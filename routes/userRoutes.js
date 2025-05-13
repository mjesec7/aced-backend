const express = require('express');
const router = express.Router();
const User = require('../models/user');
const TopicProgress = require('../models/topicProgress');
const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const admin = require('../config/firebase');
const verifyToken = require('../middlewares/authMiddleware');

// 🔍 Validate firebaseId param
function validateFirebaseId(req, res, next) {
  if (!req.params.firebaseId) {
    return res.status(400).json({ error: '❌ Missing firebaseId in request' });
  }
  next();
}

// 🔐 Ensure token UID matches route param
function verifyOwnership(req, res, next) {
  if (!req.user || req.user.uid !== req.params.firebaseId) {
    return res.status(403).json({ error: '❌ Access denied: user mismatch' });
  }
  next();
}

// ✅ Save or update user (Google or Email login)
router.post('/save', async (req, res) => {
  console.log('📥 Incoming /users/save request:', req.body);

  const { token, name, subscriptionPlan } = req.body;
  if (!token || !name) {
    return res.status(400).json({ error: '❌ Missing token or name' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const { uid, email, picture } = decoded;

    if (!uid || !email) {
      return res.status(400).json({ error: '❌ Invalid token: missing uid/email' });
    }

    let user = await User.findOne({ firebaseId: uid });

    if (user) {
      user.name = name;
      user.subscriptionPlan = subscriptionPlan || user.subscriptionPlan;
      await user.save();
      console.log(`🔁 Updated existing user: ${uid}`);
      return res.json(user);
    }

    const newUser = new User({
      firebaseId: uid,
      name,
      email,
      photoURL: picture || '',
      subscriptionPlan: subscriptionPlan || 'free',
    });

    await newUser.save();
    console.log(`✅ Created new user: ${uid}`);
    return res.status(201).json(newUser);

  } catch (err) {
    console.error('❌ Firebase token verification or DB error:', err);
    return res.status(500).json({ error: '❌ Failed to verify token or save user' });
  }
});

// ✅ Fetch user info
router.get('/:firebaseId', validateFirebaseId, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: '❌ Server error fetching user' });
  }
});

// ✅ Fetch user subscription status
router.get('/:firebaseId/status', validateFirebaseId, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json({ status: user.subscriptionPlan || 'free' });
  } catch (err) {
    res.status(500).json({ error: '❌ Server error fetching user status' });
  }
});

// 📚 Study List (GET)
router.get('/:firebaseId/study-list', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json(user.studyList || []);
  } catch (err) {
    res.status(500).json({ error: '❌ Server error fetching study list' });
  }
});

// 📚 Study List (POST)
router.post('/:firebaseId/study-list', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { subject, level, topic } = req.body;
  if (!subject || !topic) return res.status(400).json({ error: '❌ Subject and topic are required' });

  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });

    if (!user.studyList) user.studyList = [];
    const exists = user.studyList.some(entry => entry.name === topic && entry.subject === subject);

    if (!exists) {
      user.studyList.push({ name: topic, subject, level });
      await user.save();
    }

    res.json(user.studyList);
  } catch (err) {
    res.status(500).json({ error: '❌ Error adding to study list' });
  }
});

// 📚 Study List (DELETE)
router.delete('/:firebaseId/study-list/:topicId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { topicId } = req.params;
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });

    user.studyList = (user.studyList || []).filter(entry => entry._id?.toString() !== topicId);
    await user.save();
    res.json({ message: '✅ Study topic removed', studyList: user.studyList });
  } catch (err) {
    res.status(500).json({ error: '❌ Error removing topic from study list' });
  }
});

// 🎯 Recommendations
router.get('/:firebaseId/recommendations', validateFirebaseId, async (req, res) => {
  try {
    const topics = await Topic.aggregate([{ $sample: { size: 6 } }]);
    res.json(topics);
  } catch (err) {
    res.status(500).json({ error: '❌ Error fetching recommendations' });
  }
});

// ✅ Lesson Progress
router.post('/:firebaseId/progress', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { lessonId, section } = req.body;
  if (!lessonId || !section) return res.status(400).json({ error: '❌ Missing lessonId or section' });

  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });

    user.progress = user.progress || {};
    user.progress[lessonId] = user.progress[lessonId] || {};
    user.progress[lessonId][section] = true;

    await user.save();
    res.json(user.progress[lessonId]);
  } catch (err) {
    res.status(500).json({ error: '❌ Error updating lesson progress' });
  }
});

// ✅ Topic Progress
router.post('/:firebaseId/progress-topic', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { topicId } = req.body;
  if (!topicId) return res.status(400).json({ error: '❌ Missing topicId' });

  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });

    let progress = await TopicProgress.findOne({ userId: user._id, topicId });
    if (!progress) {
      const totalLessons = await Lesson.countDocuments({ topic: topicId });
      progress = new TopicProgress({
        userId: user._id,
        topicId,
        totalLessons,
        completedLessons: 0,
        percent: 0,
        medal: 'none',
      });
    }

    progress.completedLessons += 1;
    progress.percent = progress.totalLessons > 0
      ? (progress.completedLessons / progress.totalLessons) * 100
      : 0;

    progress.medal =
      progress.percent >= 90 ? 'gold' :
      progress.percent >= 70 ? 'silver' :
      progress.percent >= 50 ? 'bronze' : 'none';

    await progress.save();
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: '❌ Error updating topic progress' });
  }
});

// 📓 Diary (GET)
router.get('/:firebaseId/diary', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });

    res.json(user.diary || []);
  } catch (err) {
    res.status(500).json({ error: '❌ Error fetching diary' });
  }
});

// 📓 Diary (POST)
router.post('/:firebaseId/diary', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { date, studyMinutes, completedTopics, averageGrade } = req.body;
  if (!date || studyMinutes == null || completedTopics == null || averageGrade == null) {
    return res.status(400).json({ error: '❌ Invalid diary data' });
  }

  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });

    user.diary = user.diary || [];
    user.diary.push({ date, studyMinutes, completedTopics, averageGrade });

    await user.save();
    res.status(201).json({ message: '✅ Diary entry saved' });
  } catch (err) {
    res.status(500).json({ error: '❌ Error saving diary' });
  }
});

module.exports = router;