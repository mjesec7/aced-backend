const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionIndex: { type: Number, required: true },
  answer: { type: String, required: true }
}, { _id: false });

const homeworkProgressSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true // Firebase UID
  },
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    required: true
  },
  answers: {
    type: [answerSchema],
    default: []
  },
  completed: {
    type: Boolean,
    default: false
  },
  score: {
    type: Number,
    default: 0
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Optionally ensure unique user+lesson combination
homeworkProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });

const HomeworkProgress = mongoose.model('HomeworkProgress', homeworkProgressSchema);
module.exports = HomeworkProgress;
