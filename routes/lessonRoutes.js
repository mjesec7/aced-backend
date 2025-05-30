// lessonRoutes.js (Fully corrected version)
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const verifyToken = require('../middlewares/authMiddleware');

// ─── Middleware: Logging ─────────────────────────────
router.use((req, res, next) => {
  console.log(`📢 [${req.method}] ${req.originalUrl}`);
  next();
});

// ─── Middleware: Validate ObjectId ──────────────────
function validateObjectId(req, res, next) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    console.warn(`⚠️ Invalid ObjectId: ${id}`);
    return res.status(400).json({ message: '❌ Invalid lesson ID format' });
  }
  next();
}

// ─── DELETE: All Lessons (Must come before /:id) ────
router.delete('/all', verifyToken, async (req, res) => {
  try {
    const result = await Lesson.deleteMany({});
    console.log(`🧹 Deleted ${result.deletedCount} lessons`);
    res.status(200).json({ message: `✅ Deleted ${result.deletedCount} lessons` });
  } catch (error) {
    console.error('❌ Error deleting all lessons:', error);
    res.status(500).json({ message: '❌ Server error clearing lessons', error: error.message });
  }
});

// ─── GET: All Lessons ───────────────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = req.query.type ? { type: req.query.type } : {};
    const lessons = await Lesson.find(filter);
    console.log(`📄 Returned ${lessons.length} lessons (filter: ${filter.type || 'all'})`);
    res.status(200).json(lessons);
  } catch (error) {
    console.error('❌ Failed to fetch all lessons:', error);
    res.status(500).json({ message: '❌ Server error fetching lessons', error: error.message });
  }
});

// ─── POST: New Lesson ───────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      lessonName, subject, level, type, topicId, topic, topicDescription,
      description, explanations, examples, content, hint,
      exerciseGroups, quiz, relatedSubjects, translations,
      explanation, exercises, quizzes, abcExercises,
      homeworkABC, homeworkQA, steps
    } = req.body;

    if (!lessonName || !subject || level === undefined || !type || !description) {
      return res.status(400).json({ message: '❌ Required fields: lessonName, subject, level, type, description' });
    }

    const normalizedExplanations = Array.isArray(explanations)
      ? explanations
      : explanation ? [explanation] : [];

    const normalizedExercises = Array.isArray(exerciseGroups)
      ? exerciseGroups
      : Array.isArray(exercises)
        ? [{ exercises }] : [];

    let normalizedQuiz = [];
    if (Array.isArray(quiz)) normalizedQuiz = [...quiz];
    if (Array.isArray(abcExercises)) normalizedQuiz.push(...abcExercises);
    if (Array.isArray(quizzes)) normalizedQuiz.push(...quizzes);

    const homework = [
      ...(Array.isArray(homeworkABC) ? homeworkABC : []),
      ...(Array.isArray(homeworkQA) ? homeworkQA : []),
      ...(Array.isArray(abcExercises) ? abcExercises : [])
    ];

    let resolvedTopic = null;
    if (topicId && mongoose.Types.ObjectId.isValid(topicId)) {
      resolvedTopic = await Topic.findById(topicId);
    }

    if (!resolvedTopic) {
      const topicName = typeof topic === 'string' ? topic.trim() : '';
      const topicDesc = typeof topicDescription === 'string' ? topicDescription.trim() : '';
      if (!topicName) return res.status(400).json({ message: '❌ Topic name is required' });

      resolvedTopic = await Topic.findOne({ subject, level, name: topicName });
      if (!resolvedTopic) {
        resolvedTopic = new Topic({
          name: topicName,
          subject,
          level,
          description: topicDesc
        });
        await resolvedTopic.save();
        console.log(`✅ Created topic "${resolvedTopic.name}"`);
      } else {
        console.log(`ℹ️ Reused topic "${resolvedTopic.name}"`);
      }
    }

    const newLesson = new Lesson({
      lessonName: lessonName.trim(),
      subject,
      level,
      type,
      topic: resolvedTopic.name,
      topicId: resolvedTopic._id,
      description: description.trim(),
      explanations: normalizedExplanations,
      examples: typeof examples === 'string' ? examples.trim() : '',
      content: typeof content === 'string' ? content.trim() : '',
      hint: typeof hint === 'string' ? hint.trim() : '',
      exerciseGroups: normalizedExercises,
      quiz: normalizedQuiz,
      relatedSubjects: Array.isArray(relatedSubjects) ? relatedSubjects : [],
      translations: typeof translations === 'object' ? translations : {},
      steps: Array.isArray(steps) ? steps : [],
      homework
    });

    const saved = await newLesson.save();
    console.log(`✅ Saved lesson "${saved.lessonName}"`);
    res.status(201).json(saved);
  } catch (error) {
    console.error('❌ Error saving lesson:', error);
    res.status(500).json({ message: '❌ Server error creating lesson', error: error.message });
  }
});

// ─── GET: Lesson by ID ──────────────────────────────
router.get('/:id', validateObjectId, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: '❌ Lesson not found' });
    res.status(200).json(lesson);
  } catch (error) {
    console.error('❌ Error fetching lesson by ID:', error);
    res.status(500).json({ message: '❌ Server error fetching lesson', error: error.message });
  }
});

// ─── GET: Lesson by Subject & Name ──────────────────
router.get('/by-name', async (req, res) => {
  const { subject, name } = req.query;
  if (!subject || !name) {
    return res.status(400).json({ message: '❌ Missing subject or topic name' });
  }

  try {
    const lessons = await Lesson.find({ subject, topic: name });
    if (!lessons.length) return res.status(404).json({ message: '❌ Lesson not found' });
    res.status(200).json(lessons[0]);
  } catch (error) {
    console.error('❌ Error fetching lesson by name:', error);
    res.status(500).json({ message: '❌ Server error fetching lesson', error: error.message });
  }
});

// ─── GET: Lessons by Topic ID ───────────────────────
router.get('/topic/:topicId', async (req, res) => {
  const { topicId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(topicId)) {
    console.warn(`⚠️ Invalid topicId: ${topicId}`);
    return res.status(400).json({ message: '❌ Invalid topic ID' });
  }

  try {
    const lessons = await Lesson.find({ topicId });
    if (!lessons.length) return res.status(404).json({ message: '❌ No lessons found for this topic' });
    res.status(200).json(lessons);
  } catch (error) {
    console.error('❌ Error fetching lessons by topic ID:', error);
    res.status(500).json({ message: '❌ Server error fetching lessons by topic', error: error.message });
  }
});

// ─── PUT: Update Lesson ─────────────────────────────
router.put('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    const updates = req.body;
    updates.homework = [
      ...(Array.isArray(updates.homeworkABC) ? updates.homeworkABC : []),
      ...(Array.isArray(updates.homeworkQA) ? updates.homeworkQA : []),
      ...(Array.isArray(updates.abcExercises) ? updates.abcExercises : [])
    ];

    const updated = await Lesson.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!updated) return res.status(404).json({ message: '❌ Lesson not found' });
    res.status(200).json(updated);
  } catch (error) {
    console.error('❌ Error updating lesson:', error);
    res.status(500).json({ message: '❌ Server error updating lesson', error: error.message });
  }
});

// ─── DELETE: One Lesson ─────────────────────────────
router.delete('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    const deleted = await Lesson.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: '❌ Lesson not found' });
    res.status(200).json({ message: '✅ Lesson deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting lesson:', error);
    res.status(500).json({ message: '❌ Server error deleting lesson', error: error.message });
  }
});

module.exports = router;
