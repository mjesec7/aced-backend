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

router.get('/test-auth', verifyToken, (req, res) => {
  console.log('✅ /test-auth passed. User UID:', req.user.uid);
  res.json({ message: 'Auth works ✅', uid: req.user.uid });
});

router.get('/by-name', async (req, res) => {
  const { subject, name, lang } = req.query;
  if (!subject || !name) {
    return res.status(400).json({ message: '❌ Missing subject or name' });
  }
  try {
    const lesson = await Lesson.findOne({ subject, topic: name });
    if (!lesson) return res.status(404).json({ message: '❌ Lesson not found' });

    if (lang && lesson.translations && lesson.translations[lang]) {
      return res.json({ ...lesson.toObject(), ...lesson.translations[lang] });
    }

    res.json(lesson);
  } catch (err) {
    console.error('❌ [GET /lessons/by-name] Error:', err);
    res.status(500).json({ message: '❌ Server error', error: err.message });
  }
});

router.delete('/all', verifyToken, async (req, res) => {
  try {
    const result = await Lesson.deleteMany({});
    console.log(`🗑️ Удалено ВСЕ уроки: ${result.deletedCount}`);
    res.json({ message: `✅ Удалено ${result.deletedCount} уроков.` });
  } catch (error) {
    console.error('❌ Ошибка удаления всех уроков:', error);
    res.status(500).json({ message: '❌ Ошибка удаления всех уроков', error: error.message });
  }
});

router.delete('/subject/:subjectName', verifyToken, async (req, res) => {
  try {
    const result = await Lesson.deleteMany({ subject: req.params.subjectName });
    console.log(`🗑️ Удалено ${result.deletedCount} урок(ов) по предмету: ${req.params.subjectName}`);
    res.json({ message: `✅ Удалено ${result.deletedCount} урок(ов) по предмету "${req.params.subjectName}".` });
  } catch (error) {
    console.error('❌ Ошибка удаления по предмету:', error);
    res.status(500).json({ message: '❌ Ошибка удаления по предмету', error: error.message });
  }
});

router.delete('/topic/:subjectName/:level/:topicName', verifyToken, async (req, res) => {
  const { subjectName, level, topicName } = req.params;
  try {
    const result = await Lesson.deleteMany({ subject: subjectName, level: Number(level), topic: topicName });
    console.log(`🗑️ Удалено ${result.deletedCount} урок(ов) по теме "${topicName}" в уровне ${level} (${subjectName})`);
    res.json({ message: `✅ Удалено ${result.deletedCount} урок(ов) по теме "${topicName}".` });
  } catch (error) {
    console.error('❌ Ошибка удаления по теме:', error);
    res.status(500).json({ message: '❌ Ошибка удаления по теме', error: error.message });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    let {
      lessonName,
      subject,
      level,
      type,
      topicId,
      topic,
      topicDescription,
      description,
      explanation,
      examples,
      content,
      hint,
      exercises,
      quizzes,
      relatedSubjects,
      translations
    } = req.body;

    if (!lessonName || !subject || level === undefined || !type || !description || !explanation || !examples) {
      return res.status(400).json({ message: '❌ Missing required lesson fields' });
    }

    const wrapLocalized = val => {
      if (typeof val === 'string') return { en: val.trim() };
      if (val && typeof val === 'object' && 'en' in val) return val;
      return { en: '' };
    };

    lessonName = wrapLocalized(lessonName);
    description = wrapLocalized(description);
    explanation = wrapLocalized(explanation);
    examples = wrapLocalized(examples);
    content = wrapLocalized(content);
    hint = wrapLocalized(hint);

    let resolvedTopic;

    if (topicId && mongoose.Types.ObjectId.isValid(topicId)) {
      resolvedTopic = await Topic.findById(topicId);
    }

    if (!resolvedTopic) {
      const topicName = typeof topic === 'string' ? topic.trim() : (topic?.en || 'Untitled Topic');
      const topicDesc = typeof topicDescription === 'string' ? topicDescription.trim() : (topicDescription?.en || '');

      // 🔍 Try to find existing topic by name, subject, level
      resolvedTopic = await Topic.findOne({
        subject,
        level,
        'name.en': topicName
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
      console.log(`✅ Created new topic: ${resolvedTopic.name.en} (${resolvedTopic._id})`);
    }

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

    console.log('🧪 Saving lesson:', JSON.stringify(newLesson, null, 2));
    const savedLesson = await newLesson.save();
    console.log(`✅ Новый урок добавлен: "${savedLesson.lessonName.en}" (${savedLesson._id})`);
    res.status(201).json(savedLesson);
  } catch (error) {
    console.error('❌ Ошибка добавления урока:', error.stack || error);
    res.status(500).json({ message: '❌ Server error adding lesson', error: error.message });
  }
});

router.get('/topic/:topicId', async (req, res) => {
  try {
    const lessons = await Lesson.find({ topic: req.params.topicId });
    console.log(`📤 Найдено ${lessons.length} урок(ов) для темы: "${req.params.topicId}"`);
    res.status(200).json(lessons);
  } catch (error) {
    console.error('❌ Ошибка получения уроков по теме:', error);
    res.status(500).json({ message: '❌ Server error fetching lessons by topic', error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const filter = req.query.type ? { type: req.query.type } : {};
    const lessons = await Lesson.find(filter);
    console.log(`📤 Отправлено ${lessons.length} урок(ов) (фильтр: ${filter.type || 'all'})`);
    res.status(200).json(lessons);
  } catch (error) {
    console.error('❌ Ошибка получения всех уроков:', error);
    res.status(500).json({ message: '❌ Server error fetching lessons', error: error.message });
  }
});

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

    console.log(`📅 Урок успешно получен: ${lesson.lessonName.en} (${lesson._id})`);
    res.status(200).json(lesson);
  } catch (error) {
    console.error('❌ Ошибка по идентификатору:', error);
    res.status(500).json({ message: '❌ Server error fetching lesson', error: error.message });
  }
});

router.put('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    const updatedLesson = await Lesson.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedLesson) {
      console.warn(`⚠️ Невозможно обновить, урок не найден: ${req.params.id}`);
      return res.status(404).json({ message: '❌ Lesson not found' });
    }
    console.log(`🔄 Урок обновлён: ${updatedLesson.lessonName.en} (${updatedLesson._id})`);
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
    console.log(`🗑️ Урок удалён: ${deletedLesson.lessonName.en} (${deletedLesson._id})`);
    res.status(200).json({ message: '✅ Lesson successfully deleted' });
  } catch (error) {
    console.error('❌ Ошибка удаления урока:', error);
    res.status(500).json({ message: '❌ Server error deleting lesson', error: error.message });
  }
});

module.exports = router;
