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

module.exports = router;
