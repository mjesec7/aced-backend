// models/userProgress.js

const mongoose = require('mongoose');

const userProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    required: true
  },

  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic'
  },

  completedSteps: {
    type: [Number], // e.g., [0, 1, 2, 3]
    default: []
  },

  percent: {
    type: Number,
    default: 0 // 0–100
  },

  stars: {
    type: Number,
    enum: [0, 1, 2, 3],
    default: 0
  },

  pointsEarned: {
    type: Number,
    default: 0
  },

  mistakes: {
    type: Number,
    default: 0
  },

  usedHints: {
    type: Boolean,
    default: false
  },

  submittedHomework: {
    type: Boolean,
    default: false
  },

  completedAt: {
    type: Date
  },

  durationSeconds: {
    type: Number,
    default: 0 // How long they spent on lesson
  }
}, { timestamps: true });

module.exports = mongoose.model('UserProgress', userProgressSchema);
