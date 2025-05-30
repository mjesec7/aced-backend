const HomeworkProgress = require('../models/homeworkProgress');
const Lesson = require('../models/lesson');

// 🔍 Get all homeworks for a user
exports.getAllHomeworks = async (req, res) => {
  try {
    const { firebaseId } = req.params;
    const homeworks = await HomeworkProgress.find({ userId: firebaseId });
    res.json({ success: true, data: homeworks });
  } catch (err) {
    console.error('❌ Error getting homeworks:', err);
    res.status(500).json({ success: false, error: '❌ Server error while fetching homeworks' });
  }
};

// 🔍 Get single homework by lessonId
exports.getHomeworkByLesson = async (req, res) => {
  try {
    const { firebaseId, lessonId } = req.params;
    const progress = await HomeworkProgress.findOne({ userId: firebaseId, lessonId });
    res.json({ success: true, data: progress || null });
  } catch (err) {
    console.error('❌ Error getting homework:', err);
    res.status(500).json({ success: false, error: '❌ Server error while fetching homework' });
  }
};

// 💾 Save or update homework progress (draft or in-progress)
exports.saveHomework = async (req, res) => {
  try {
    const { firebaseId } = req.params;
    const { lessonId, answers, completed } = req.body;

    if (!lessonId || !Array.isArray(answers)) {
      return res.status(400).json({ success: false, error: '❌ Missing lessonId or invalid answers format' });
    }

    let progress = await HomeworkProgress.findOne({ userId: firebaseId, lessonId });

    if (progress) {
      progress.answers = answers;
      progress.completed = !!completed;
      progress.updatedAt = new Date();
    } else {
      progress = new HomeworkProgress({
        userId: firebaseId,
        lessonId,
        answers,
        completed: !!completed
      });
    }

    await progress.save();
    res.json({ success: true, data: progress });
  } catch (err) {
    console.error('❌ Error saving homework:', err);
    res.status(500).json({ success: false, error: '❌ Server error while saving homework' });
  }
};

// ✅ Submit homework + auto-grade it
exports.submitHomework = async (req, res) => {
  try {
    const { firebaseId, lessonId } = req.params;
    const { answers } = req.body;

    if (!Array.isArray(answers)) {
      return res.status(400).json({ success: false, error: '❌ Answers must be an array' });
    }

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({ success: false, error: '❌ Lesson not found' });
    }

    if (!Array.isArray(lesson.homework) || lesson.homework.length === 0) {
      return res.status(400).json({ success: false, error: '❌ This lesson has no homework to submit' });
    }

    let score = 0;
    lesson.homework.forEach((q, index) => {
      const userAnswer = answers.find(a => a.questionIndex === index);
      if (
        userAnswer &&
        typeof userAnswer.answer === 'string' &&
        typeof q.correctAnswer === 'string' &&
        userAnswer.answer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase()
      ) {
        score++;
      }
    });

    const total = lesson.homework.length;
    const percentage = Math.round((score / total) * 100);

    const updated = await HomeworkProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId },
      {
        answers,
        completed: true,
        score: percentage,
        updatedAt: new Date()
      },
      { new: true, upsert: true }
    );

    res.json({ success: true, data: updated, score: percentage });
  } catch (err) {
    console.error('❌ Error submitting homework:', err);
    res.status(500).json({ success: false, error: '❌ Server error while submitting homework' });
  }
};
