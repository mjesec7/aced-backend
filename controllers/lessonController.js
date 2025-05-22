const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const mongoose = require('mongoose');

// ✅ Add a new lesson
exports.addLesson = async (req, res) => {
  try {
    console.log('📥 [Добавление урока] Получены данные:', req.body);

    let {
      subject,
      level,
      topicId,
      topic,
      topicDescription,
      lessonName,
      explanation,
      examples,
      content,
      hint,
      quizzes,
      abcExercises,
      homeworkABC,
      homeworkQA,
      relatedSubjects,
      type,
      description,
      steps,
      translations
    } = req.body;

    if (!explanation && content) {
      console.warn('⚠️ Explanation отсутствует, используем content вместо explanation.');
      explanation = content;
    }

    if (!subject || !level || !lessonName || !explanation || !description) {
      return res.status(400).json({ error: '❌ Обязательные поля отсутствуют' });
    }

    // ✅ Topic Resolution
    let resolvedTopic = null;
    if (topicId && mongoose.Types.ObjectId.isValid(topicId)) {
      resolvedTopic = await Topic.findById(topicId);
      if (!resolvedTopic) {
        return res.status(404).json({ error: '❌ Тема с указанным ID не найдена' });
      }
    } else {
      const topicName = typeof topic === 'string' ? topic.trim() : '';
      const topicDesc = typeof topicDescription === 'string' ? topicDescription.trim() : '';

      if (!topicName) {
        return res.status(400).json({ error: '❌ Название темы отсутствует' });
      }

      resolvedTopic = await Topic.findOne({ subject, level, name: topicName });
      if (!resolvedTopic) {
        resolvedTopic = new Topic({ name: topicName, subject, level, description: topicDesc });
        await resolvedTopic.save();
        console.log(`✅ [Создание темы] "${resolvedTopic.name}" (ID: ${resolvedTopic._id})`);
      } else {
        console.log(`ℹ️ [Использование существующей темы] ${resolvedTopic.name} (ID: ${resolvedTopic._id})`);
      }
    }

    // ✅ Homework merging
    const combinedHomework = [
      ...(Array.isArray(homeworkABC) ? homeworkABC : []),
      ...(Array.isArray(homeworkQA) ? homeworkQA : []),
      ...(Array.isArray(abcExercises) ? abcExercises : [])
    ];

    // ✅ Construct Lesson
    const newLesson = new Lesson({
      subject,
      level,
      topic: resolvedTopic.name,
      topicId: resolvedTopic._id,
      lessonName: typeof lessonName === 'string' ? lessonName.trim() : '',
      description: typeof description === 'string' ? description.trim() : '',
      explanations: [typeof explanation === 'string' ? explanation.trim() : ''],
      examples: typeof examples === 'string' ? examples.trim() : '',
      content: typeof content === 'string' ? content.trim() : '',
      hint: typeof hint === 'string' ? hint.trim() : '',
      steps: Array.isArray(steps) ? steps : [],
      quiz: Array.isArray(quizzes) ? quizzes : [],
      homework: combinedHomework,
      relatedSubjects: Array.isArray(relatedSubjects) ? relatedSubjects : [],
      type: type || 'free',
      translations: typeof translations === 'object' ? translations : {}
    });

    await newLesson.save();
    console.log(`✅ [Добавление урока] Сохранено: "${newLesson.lessonName}" (ID: ${newLesson._id})`);
    res.status(201).json(newLesson);
  } catch (error) {
    console.error('❌ Ошибка при добавлении урока:', error);
    if (error.code === 11000) {
      return res.status(409).json({ error: '❌ Дублирование: похожая тема или урок уже существует' });
    }
    res.status(500).json({ error: error.message || '❌ Ошибка при добавлении урока' });
  }
};

// ✅ Update lesson
exports.updateLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    if (!lessonId) {
      return res.status(400).json({ error: '❌ Отсутствует ID урока' });
    }

    const updates = req.body;

    if (!updates.explanation && updates.content) {
      updates.explanation = updates.content;
    }

    updates.homework = [
      ...(Array.isArray(updates.homeworkABC) ? updates.homeworkABC : []),
      ...(Array.isArray(updates.homeworkQA) ? updates.homeworkQA : []),
      ...(Array.isArray(updates.abcExercises) ? updates.abcExercises : [])
    ];

    const updatedLesson = await Lesson.findByIdAndUpdate(lessonId, updates, { new: true });

    if (!updatedLesson) {
      return res.status(404).json({ error: '❌ Урок не найден' });
    }

    console.log(`✅ [Обновление] "${updatedLesson.lessonName}" (ID: ${updatedLesson._id})`);
    res.json(updatedLesson);
  } catch (error) {
    console.error('❌ Ошибка при обновлении урока:', error);
    res.status(500).json({ error: error.message || '❌ Ошибка при обновлении' });
  }
};

// ✅ Delete lesson
exports.deleteLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    if (!lessonId) {
      return res.status(400).json({ error: '❌ Отсутствует ID урока' });
    }

    const deletedLesson = await Lesson.findByIdAndDelete(lessonId);
    if (!deletedLesson) {
      return res.status(404).json({ error: '❌ Урок не найден' });
    }

    console.log(`🗑️ [Удаление] "${deletedLesson.lessonName}" (ID: ${deletedLesson._id})`);
    res.json({ message: '✅ Урок удалён' });
  } catch (error) {
    console.error('❌ Ошибка при удалении урока:', error);
    res.status(500).json({ error: error.message || '❌ Ошибка при удалении' });
  }
};

// ✅ Get one lesson
exports.getLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    if (!lessonId) {
      return res.status(400).json({ error: '❌ Отсутствует ID урока' });
    }

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({ error: '❌ Урок не найден' });
    }

    console.log(`📘 [Получение] "${lesson.lessonName}" (ID: ${lesson._id})`);
    res.json(lesson);
  } catch (error) {
    console.error('❌ Ошибка при получении урока:', error);
    res.status(500).json({ error: error.message || '❌ Ошибка при получении урока' });
  }
};

// ✅ Get lessons by topic
exports.getLessonsByTopic = async (req, res) => {
  try {
    const topicId = req.params.topicId;
    if (!topicId) {
      return res.status(400).json({ error: '❌ Отсутствует TopicID' });
    }

    const lessons = await Lesson.find({ topicId });
    console.log(`📚 [Тематика] Найдено ${lessons.length} урок(ов) для TopicID: "${topicId}"`);
    res.json(lessons);
  } catch (error) {
    console.error('❌ Ошибка при получении уроков:', error);
    res.status(500).json({ error: error.message || '❌ Ошибка при получении уроков' });
  }
};

module.exports = {
  addLesson,
  updateLesson,
  deleteLesson,
  getLesson,
  getLessonsByTopic
};
