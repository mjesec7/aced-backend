// models/homeworkProgress.js

const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionIndex: { type: Number, required: true }, // Index in the homework array
  userAnswer: { type: String, required: true },
  correctAnswer: { type: String, default: '' },
  isCorrect: { type: Boolean, default: false },
  type: {
    type: String,
    enum: ['manual', 'auto'],
    default: 'auto'
  }
}, { _id: false });

const homeworkProgressSchema = new mongoose.Schema({
  userId: {
    type: String, // Firebase UID
    required: true
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
    default: 0 // Percent or raw
  },

  stars: {
    type: Number,
    enum: [0, 1, 2, 3],
    default: 0
  },

  submittedAt: {
    type: Date
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure one submission per user per lesson
homeworkProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });

const HomeworkProgress = mongoose.model('HomeworkProgress', homeworkProgressSchema);
module.exports = HomeworkProgress;
