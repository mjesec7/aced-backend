const Lesson = require('../models/lesson');

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
      quiz,
      relatedSubjects,
      type
    } = req.body;

    // Use content as fallback if explanation is missing
    if (!explanation && content) {
      console.warn('⚠️ [Добавление урока] Explanation отсутствует, используем content вместо explanation.');
      explanation = content;
    }

    // Validate required fields
    if (!subject || !level || !topicId || !lessonName || !explanation || !examples) {
      console.warn('⚠️ [Добавление урока] Обязательные поля отсутствуют:', { subject, level, topicId, lessonName, explanation, examples });
      return res.status(400).json({ error: '❌ Обязательные поля отсутствуют' });
    }

    // Create a new Lesson
    const newLesson = new Lesson({
      subject,
      level,
      topic: topicId, // ⚡ Save topicId in topic field, as your model expects topic (not topicId)
      lessonName,
      explanation,
      examples,
      content: content || '',
      hint: hint || '',
      exercises: exercises || [],
      quiz: quiz || [],
      relatedSubjects: relatedSubjects || [],
      type: type || 'free',
    });

    await newLesson.save();

    console.log(`✅ [Добавление урока] Урок успешно сохранён: "${newLesson.lessonName}" (ID: ${newLesson._id})`);
    res.status(201).json(newLesson);
  } catch (error) {
    console.error('❌ [Добавление урока] Ошибка при сохранении урока:', error.message || error);
    res.status(500).json({ error: error.message || '❌ Ошибка при добавлении урока' });
  }
};

// ✅ Update existing lesson
exports.updateLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    const updates = req.body;

    console.log(`📥 [Обновление урока] ID: ${lessonId}, Обновления:`, updates);

    if (!lessonId) {
      console.warn('⚠️ [Обновление урока] lessonId отсутствует.');
      return res.status(400).json({ error: '❌ Отсутствует ID урока' });
    }

    if (!updates.explanation && updates.content) {
      console.warn('⚠️ [Обновление урока] Explanation отсутствует, используем content вместо explanation.');
      updates.explanation = updates.content;
    }

    const updatedLesson = await Lesson.findByIdAndUpdate(lessonId, updates, { new: true });

    if (!updatedLesson) {
      console.warn(`⚠️ [Обновление урока] Урок с ID ${lessonId} не найден.`);
      return res.status(404).json({ error: '❌ Урок не найден' });
    }

    console.log(`✅ [Обновление урока] Урок успешно обновлён: "${updatedLesson.lessonName}" (ID: ${updatedLesson._id})`);
    res.json(updatedLesson);
  } catch (error) {
    console.error('❌ [Обновление урока] Ошибка при обновлении урока:', error.message || error);
    res.status(500).json({ error: error.message || '❌ Ошибка при обновлении' });
  }
};

// ✅ Delete lesson
exports.deleteLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    console.log(`📥 [Удаление урока] ID: ${lessonId}`);

    if (!lessonId) {
      console.warn('⚠️ [Удаление урока] lessonId отсутствует.');
      return res.status(400).json({ error: '❌ Отсутствует ID урока' });
    }

    const deletedLesson = await Lesson.findByIdAndDelete(lessonId);

    if (!deletedLesson) {
      console.warn(`⚠️ [Удаление урока] Урок с ID ${lessonId} не найден для удаления.`);
      return res.status(404).json({ error: '❌ Урок не найден' });
    }

    console.log(`✅ [Удаление урока] Урок успешно удалён: "${deletedLesson.lessonName}" (ID: ${deletedLesson._id})`);
    res.json({ message: '✅ Урок удалён' });
  } catch (error) {
    console.error('❌ [Удаление урока] Ошибка при удалении урока:', error.message || error);
    res.status(500).json({ error: error.message || '❌ Ошибка при удалении' });
  }
};

// ✅ Fetch one lesson
exports.getLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    console.log(`📥 [Получение урока] ID: ${lessonId}`);

    if (!lessonId) {
      console.warn('⚠️ [Получение урока] lessonId отсутствует.');
      return res.status(400).json({ error: '❌ Отсутствует ID урока' });
    }

    const lesson = await Lesson.findById(lessonId);

    if (!lesson) {
      console.warn(`⚠️ [Получение урока] Урок с ID ${lessonId} не найден.`);
      return res.status(404).json({ error: '❌ Урок не найден' });
    }

    if (!lesson.explanation && lesson.content) {
      console.warn(`⚠️ [Получение урока] Explanation отсутствует, берём content.`);
      lesson.explanation = lesson.content;
    }

    console.log(`✅ [Получение урока] Урок успешно получен: "${lesson.lessonName}" (ID: ${lesson._id})`);
    res.json(lesson);
  } catch (error) {
    console.error('❌ [Получение урока] Ошибка при получении урока:', error.message || error);
    res.status(500).json({ error: error.message || '❌ Ошибка при получении урока' });
  }
};

// ✅ Fetch all lessons of a topic
exports.getLessonsByTopic = async (req, res) => {
  try {
    const topicId = req.params.topicId;
    console.log(`📥 [Получение уроков по теме] TopicID: ${topicId}`);

    if (!topicId) {
      console.warn('⚠️ [Получение уроков по теме] topicId отсутствует.');
      return res.status(400).json({ error: '❌ Отсутствует TopicID' });
    }

    const lessons = await Lesson.find({ topic: topicId });

    console.log(`✅ [Получение уроков по теме] Найдено ${lessons.length} урок(ов) для TopicID: "${topicId}"`);
    res.json(lessons);
  } catch (error) {
    console.error('❌ [Получение уроков по теме] Ошибка при получении уроков:', error.message || error);
    res.status(500).json({ error: error.message || '❌ Ошибка при получении уроков' });
  }
};

module.exports = {
  addLesson,
  updateLesson,
  deleteLesson,
  getLesson,
  getLessonsByTopic,
};
