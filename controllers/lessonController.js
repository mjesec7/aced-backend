const Lesson = require('../models/lesson');
const Topic = require('../models/topic');

// ✅ Add a new lesson
exports.addLesson = async (req, res) => {
  try {
    console.log('📥 [Добавление урока] Получены данные:', req.body);

    let {
      subject,
      level,
      topicId,
      lessonName,
      explanation,
      examples,
      content,
      hint,
      exercises,
      quizzes,
      relatedSubjects,
      type,
      description
    } = req.body;

    if (!explanation && content) {
      console.warn('⚠️ Explanation отсутствует, используем content вместо explanation.');
      explanation = content;
    }

    if (!subject || !level || !topicId || !lessonName || !explanation || !examples || !description) {
      return res.status(400).json({ error: '❌ Обязательные поля отсутствуют' });
    }

    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ error: '❌ Тема не найдена' });
    }

    const newLesson = new Lesson({
      subject,
      level,
      topic: topicId,
      topicId,
      lessonName,
      description,
      explanation,
      examples,
      content: content || '',
      hint: hint || '',
      exercises: exercises || [],
      quizzes: quizzes || [],
      relatedSubjects: relatedSubjects || [],
      type: type || 'free'
    });

    await newLesson.save();
    console.log(`✅ [Добавление урока] Урок успешно сохранён: "${newLesson.lessonName}" (ID: ${newLesson._id})`);
    res.status(201).json(newLesson);
  } catch (error) {
    console.error('❌ Ошибка при добавлении урока:', error);
    res.status(500).json({ error: error.message || '❌ Ошибка при добавлении урока' });
  }
};

// ✅ Update lesson
exports.updateLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    const updates = req.body;

    if (!lessonId) {
      return res.status(400).json({ error: '❌ Отсутствует ID урока' });
    }

    if (!updates.explanation && updates.content) {
      updates.explanation = updates.content;
    }

    const updatedLesson = await Lesson.findByIdAndUpdate(lessonId, updates, { new: true });

    if (!updatedLesson) {
      return res.status(404).json({ error: '❌ Урок не найден' });
    }

    console.log(`✅ [Обновление урока] Урок успешно обновлён: "${updatedLesson.lessonName}" (ID: ${updatedLesson._id})`);
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

    console.log(`✅ [Удаление урока] Урок успешно удалён: "${deletedLesson.lessonName}" (ID: ${deletedLesson._id})`);
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

    if (!lesson.explanation && lesson.content) {
      lesson.explanation = lesson.content;
    }

    console.log(`✅ [Получение урока] Урок успешно получен: "${lesson.lessonName}" (ID: ${lesson._id})`);
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

    const lessons = await Lesson.find({ topic: topicId });
    console.log(`✅ [Получение уроков по теме] Найдено ${lessons.length} урок(ов) для TopicID: "${topicId}"`);
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
