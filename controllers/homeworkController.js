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
    res.status(500).json({ success: false, error: 'Server error' });
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
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// 💾 Save or update homework progress
exports.saveHomework = async (req, res) => {
  try {
    const { firebaseId } = req.params;
    const { lessonId, answers, completed } = req.body;

    let progress = await HomeworkProgress.findOne({ userId: firebaseId, lessonId });
    if (progress) {
      progress.answers = answers;
      progress.completed = completed || false;
      progress.updatedAt = new Date();
    } else {
      progress = new HomeworkProgress({
        userId: firebaseId,
        lessonId,
        answers,
        completed: completed || false
      });
    }

    await progress.save();
    res.json({ success: true, data: progress });
  } catch (err) {
    console.error('❌ Error saving homework:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ✅ Submit homework + auto-grade
exports.submitHomework = async (req, res) => {
  try {
    const { firebaseId, lessonId } = req.params;
    const { answers } = req.body;

    const lesson = await Lesson.findById(lessonId);
    if (!lesson || !lesson.homework || lesson.homework.length === 0) {
      return res.status(404).json({ success: false, error: 'Homework not found for this lesson' });
    }

    let score = 0;
    lesson.homework.forEach((q, index) => {
      const userAnswer = answers.find(a => a.questionIndex === index);
      if (userAnswer && userAnswer.answer.trim() === q.correctAnswer.trim()) {
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
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
