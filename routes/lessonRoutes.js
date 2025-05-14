const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const verifyToken = require('../middlewares/authMiddleware');

// 🔎 Log all incoming routes
router.use((req, res, next) => {
  console.log(`📢 [${req.method}] ${req.originalUrl}`);
  next();
});

// 🔒 Validate MongoDB ObjectId
function validateObjectId(req, res, next) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    console.warn(`⚠️ Invalid ObjectId: ${req.params.id}`);
    return res.status(400).json({ message: '❌ Invalid lesson ID format' });
  }
  next();
}

// ✅ Get all lessons (with optional type filter)
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

// ✅ Get lesson by ID with optional translation merge
router.get('/:id', validateObjectId, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      console.warn(`⚠️ Урок не найден: ${req.params.id}`);
      return res.status(404).json({ message: '❌ Lesson not found' });
    }

    const lang = req.query.lang;
    if (lang && lesson.translations && lesson.translations[lang]) {
      return res.json({ ...lesson.toObject(), ...lesson.translations[lang] });
    }

    console.log(`📅 Урок успешно получен: ${lesson.lessonName?.en || lesson.lessonName} (${lesson._id})`);
    res.status(200).json(lesson);
  } catch (error) {
    console.error('❌ Ошибка по идентификатору:', error);
    res.status(500).json({ message: '❌ Server error fetching lesson', error: error.message });
  }
});

// ✅ Get lesson by subject and topic name (supports localized & translated names)
router.get('/by-name', async (req, res) => {
  const { subject, name } = req.query;
  if (!subject || !name) {
    return res.status(400).json({ message: '❌ Missing subject or topic name' });
  }

  try {
    const lessons = await Lesson.find({
      subject,
      $or: [
        { topic: name },
        { 'topic.en': name },
        { 'topic.ru': name },
        { 'translations.en.topic': name },
        { 'translations.ru.topic': name }
      ]
    });

    if (!lessons.length) {
      console.warn(`⚠️ No lesson found for subject "${subject}" and topic "${name}"`);
      return res.status(404).json({ message: '❌ Lesson not found' });
    }

    console.log(`📘 Найден урок по имени: "${name}" в предмете "${subject}"`);
    res.status(200).json(lessons[0]);
  } catch (err) {
    console.error('❌ Error fetching lesson by name:', err);
    res.status(500).json({ message: '❌ Server error fetching lesson by name', error: err.message });
  }
});

// ✅ Update lesson by ID
router.put('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    const updatedLesson = await Lesson.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedLesson) {
      console.warn(`⚠️ Невозможно обновить, урок не найден: ${req.params.id}`);
      return res.status(404).json({ message: '❌ Lesson not found' });
    }
    console.log(`🔄 Урок обновлён: ${updatedLesson.lessonName?.en || updatedLesson.lessonName} (${updatedLesson._id})`);
    res.status(200).json(updatedLesson);
  } catch (error) {
    console.error('❌ Ошибка обновления урока:', error);
    res.status(500).json({ message: '❌ Server error updating lesson', error: error.message });
  }
});

// ✅ Delete lesson by ID
router.delete('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    const deletedLesson = await Lesson.findByIdAndDelete(req.params.id);
    if (!deletedLesson) {
      console.warn(`⚠️ Урок не найден для удаления: ${req.params.id}`);
      return res.status(404).json({ message: '❌ Lesson not found' });
    }
    console.log(`🗑️ Урок удалён: ${deletedLesson.lessonName?.en || deletedLesson.lessonName} (${deletedLesson._id})`);
    res.status(200).json({ message: '✅ Lesson successfully deleted' });
  } catch (error) {
    console.error('❌ Ошибка удаления урока:', error);
    res.status(500).json({ message: '❌ Server error deleting lesson', error: error.message });
  }
});

// ✅ Bulk delete all lessons
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

// ✅ Create new lesson (auto-resolves or creates topic)
router.post('/', verifyToken, async (req, res) => {
  try {
    let {
      lessonName, subject, level, type, topicId, topic, topicDescription,
      description, explanation, examples, content, hint,
      exercises, quizzes, relatedSubjects, translations
    } = req.body;

    if (!lessonName || !subject || level === undefined || !type || !description || !explanation || !examples) {
      return res.status(400).json({ message: '❌ Missing required lesson fields' });
    }

    // 🔤 Ensure localization objects
    const wrapLocalized = val =>
      typeof val === 'string' ? { en: val.trim() } :
      (val && typeof val === 'object' && ('en' in val || 'ru' in val)) ? val : { en: '' };

    lessonName = wrapLocalized(lessonName);
    description = wrapLocalized(description);
    explanation = wrapLocalized(explanation);
    examples = wrapLocalized(examples);
    content = wrapLocalized(content);
    hint = wrapLocalized(hint);

    let resolvedTopic;

    // 🔍 Try resolving topic by ID
    if (topicId && mongoose.Types.ObjectId.isValid(topicId)) {
      resolvedTopic = await Topic.findById(topicId);
    }

    // 🔄 If no topic found, attempt to reuse or create it
    if (!resolvedTopic) {
      const topicName = typeof topic === 'string' ? topic.trim() : (topic?.en || 'Untitled Topic');
      const topicDesc = typeof topicDescription === 'string' ? topicDescription.trim() : (topicDescription?.en || '');

      resolvedTopic = await Topic.findOne({
        subject,
        level,
        $or: [
          { 'name': topicName },
          { 'name.en': topicName },
          { 'name.ru': topicName }
        ]
      });

      if (!resolvedTopic) {
        resolvedTopic = new Topic({
          name: { en: topicName },
          subject,
          level,
          description: { en: topicDesc }
        });
        await resolvedTopic.save();
        console.log(`✅ Created new topic: ${resolvedTopic.name.en} (${resolvedTopic._id})`);
      } else {
        console.log(`ℹ️ Reusing existing topic: ${resolvedTopic.name.en} (${resolvedTopic._id})`);
      }
    }

    // 🆕 Create and save lesson
    const newLesson = new Lesson({
      lessonName,
      subject,
      level,
      type,
      topic: resolvedTopic._id,
      topicId: resolvedTopic._id,
      description,
      explanation,
      examples,
      content,
      hint,
      exercises: Array.isArray(exercises) ? exercises : [],
      quizzes: Array.isArray(quizzes) ? quizzes : [],
      relatedSubjects: Array.isArray(relatedSubjects) ? relatedSubjects : [],
      translations: typeof translations === 'object' ? translations : {}
    });

    const savedLesson = await newLesson.save();
    console.log(`✅ Новый урок добавлен: "${savedLesson.lessonName?.en || savedLesson.lessonName}" (${savedLesson._id})`);
    res.status(201).json(savedLesson);
  } catch (error) {
    console.error('❌ Ошибка добавления урока:', error);
    res.status(500).json({ message: '❌ Server error adding lesson', error: error.message });
  }
});

module.exports = router;
