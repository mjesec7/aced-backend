// models/userProgress.js

const mongoose = require('mongoose');

const userProgressSchema = new mongoose.Schema({
  userId: {
    type: String, // Was: mongoose.Schema.Types.ObjectId — should match Firebase UID if that's used
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
    type: [Number], // e.g., [0, 1, 2]
    default: []
  },

  progressPercent: {
    type: Number,
    default: 0
  },

  completed: {
    type: Boolean,
    default: false
  },

  medal: {
    type: String,
    enum: ['none', 'bronze', 'silver', 'gold'],
    default: 'none'
  },

  stars: {
    type: Number,
    enum: [0, 1, 2, 3],
    default: 0
  },

  points: {
    type: Number,
    default: 0
  },

  mistakes: {
    type: Number,
    default: 0
  },

  hintsUsed: {
    type: Number,
    default: 0
  },

  submittedHomework: {
    type: Boolean,
    default: false
  },

  completedAt: {
    type: Date
  },

  duration: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('UserProgress', userProgressSchema);
