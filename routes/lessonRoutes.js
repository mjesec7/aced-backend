const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const verifyToken = require('../middlewares/authMiddleware');

router.use((req, res, next) => {
  console.log(`📢 [${req.method}] ${req.originalUrl}`);
  next();
});

function validateObjectId(req, res, next) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    console.warn(`⚠️ Invalid ObjectId: ${req.params.id}`);
    return res.status(400).json({ message: '❌ Invalid lesson ID format' });
  }
  next();
}

router.get('/', async (req, res) => {
  try {
    const filter = req.query.type ? { type: req.query.type } : {};
    const lessons = await Lesson.find(filter);
    console.log(`📄 Отправлено ${lessons.length} урок(ов) (фильтр: ${filter.type || 'all'})`);
    res.status(200).json(lessons);
  } catch (error) {
    console.error('❌ Ошибка получения всех уроков:', error);
    res.status(500).json({ message: '❌ Server error fetching lessons', error: error.message });
  }
});

router.delete('/all', verifyToken, async (req, res) => {
  try {
    const result = await Lesson.deleteMany({});
    console.log(`🧹 Удалено уроков: ${result.deletedCount}`);
    res.status(200).json({ message: `✅ Удалено уроков: ${result.deletedCount}` });
  } catch (err) {
    console.error('❌ Ошибка при массовом удалении уроков:', err);
    res.status(500).json({ message: '❌ Server error deleting all lessons', error: err.message });
  }
});

router.get('/:id', validateObjectId, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      console.warn(`⚠️ Урок не найден: ${req.params.id}`);
      return res.status(404).json({ message: '❌ Lesson not found' });
    }

    console.log(`📅 Урок получен: ${lesson.lessonName}`);
    res.status(200).json(lesson);
  } catch (error) {
    console.error('❌ Ошибка получения урока:', error);
    res.status(500).json({ message: '❌ Server error fetching lesson', error: error.message });
  }
});

router.get('/by-name', async (req, res) => {
  const { subject, name } = req.query;
  if (!subject || !name) {
    return res.status(400).json({ message: '❌ Missing subject or topic name' });
  }

  try {
    const lessons = await Lesson.find({ subject, topic: name });

    if (!lessons.length) {
      console.warn(`⚠️ Lesson not found: ${subject} + ${name}`);
      return res.status(404).json({ message: '❌ Lesson not found' });
    }

    console.log(`📘 Найден урок по имени: "${name}" в "${subject}"`);
    res.status(200).json(lessons[0]);
  } catch (err) {
    console.error('❌ Ошибка получения урока по имени:', err);
    res.status(500).json({ message: '❌ Server error fetching lesson by name', error: err.message });
  }
});

router.put('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    const updates = req.body;
    const updatedLesson = await Lesson.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!updatedLesson) {
      console.warn(`⚠️ Не найден для обновления: ${req.params.id}`);
      return res.status(404).json({ message: '❌ Lesson not found' });
    }
    console.log(`🔄 Урок обновлён: ${updatedLesson.lessonName}`);
    res.status(200).json(updatedLesson);
  } catch (error) {
    console.error('❌ Ошибка обновления урока:', error);
    res.status(500).json({ message: '❌ Server error updating lesson', error: error.message });
  }
});

router.delete('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    const deletedLesson = await Lesson.findByIdAndDelete(req.params.id);
    if (!deletedLesson) {
      console.warn(`⚠️ Урок не найден для удаления: ${req.params.id}`);
      return res.status(404).json({ message: '❌ Lesson not found' });
    }
    console.log(`🗑️ Удалён: ${deletedLesson.lessonName}`);
    res.status(200).json({ message: '✅ Lesson successfully deleted' });
  } catch (error) {
    console.error('❌ Ошибка удаления урока:', error);
    res.status(500).json({ message: '❌ Server error deleting lesson', error: error.message });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    let {
      lessonName, subject, level, type, topicId, topic, topicDescription,
      description, explanations, examples, content, hint,
      exerciseGroups, quiz, relatedSubjects, translations,
      explanation, exercises, quizzes, abcExercises,
      steps // ✅ NEW: added here
    } = req.body;

    if (!lessonName || !subject || level === undefined || !type || !description) {
      return res.status(400).json({ message: '❌ Missing required lesson fields' });
    }

    // Normalize legacy fields
    if (!Array.isArray(explanations) && explanation) {
      explanations = [explanation];
    }
    if (!Array.isArray(exerciseGroups) && Array.isArray(exercises)) {
      exerciseGroups = [{ exercises }];
    }
    if (!Array.isArray(quiz) && (Array.isArray(abcExercises) || Array.isArray(quizzes))) {
      quiz = [];
      if (Array.isArray(abcExercises)) quiz = [...quiz, ...abcExercises];
      if (Array.isArray(quizzes)) quiz = [...quiz, ...quizzes];
    }

    if (!Array.isArray(explanations)) {
      return res.status(400).json({ message: '❌ explanations[] must be an array' });
    }

    // Topic creation or reuse
    let resolvedTopic;
    if (topicId && mongoose.Types.ObjectId.isValid(topicId)) {
      resolvedTopic = await Topic.findById(topicId);
    }
    if (!resolvedTopic) {
      const topicName = typeof topic === 'string' ? topic.trim() : '';
      const topicDesc = typeof topicDescription === 'string' ? topicDescription.trim() : '';
      if (!topicName) {
        return res.status(400).json({ message: '❌ Topic name is required' });
      }
      resolvedTopic = await Topic.findOne({ subject, level, name: topicName });
      if (!resolvedTopic) {
        resolvedTopic = new Topic({ name: topicName, subject, level, description: topicDesc });
        await resolvedTopic.save();
        console.log(`✅ Created topic: ${resolvedTopic.name}`);
      } else {
        console.log(`ℹ️ Reusing topic: ${resolvedTopic.name}`);
      }
    }

    const newLesson = new Lesson({
      lessonName: typeof lessonName === 'string' ? lessonName.trim() : '',
      subject,
      level,
      type,
      topic: resolvedTopic.name,
      topicId: resolvedTopic._id,
      description: typeof description === 'string' ? description.trim() : '',
      explanations,
      examples: typeof examples === 'string' ? examples.trim() : '',
      content: typeof content === 'string' ? content.trim() : '',
      hint: typeof hint === 'string' ? hint.trim() : '',
      exerciseGroups: Array.isArray(exerciseGroups) ? exerciseGroups : [],
      quiz: Array.isArray(quiz) ? quiz : [],
      relatedSubjects: Array.isArray(relatedSubjects) ? relatedSubjects : [],
      translations: typeof translations === 'object' ? translations : {},
      steps: Array.isArray(steps) ? steps : [] // ✅ NEW FIELD
    });

    const savedLesson = await newLesson.save();
    console.log(`✅ Новый урок: "${savedLesson.lessonName}"`);
    res.status(201).json(savedLesson);
  } catch (error) {
    console.error('❌ Ошибка при добавлении урока:', error);
    res.status(500).json({ message: '❌ Server error adding lesson', error: error.message });
  }
});

module.exports = router;
