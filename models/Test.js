// models/Test.js

const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: {
    type: [String],
    required: true,
    validate: [arr => arr.length >= 2, '❌ Вопрос должен содержать минимум два варианта ответа.']
  },
  correctAnswer: { type: String, required: true },
  explanation: { type: String, default: '' } // Optional feedback
}, { _id: false });

const testSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },

  subject: { type: String, required: true }, // e.g., English, Math
  topic: { type: String, required: true }, // e.g., Grammar, Vocab
  level: { type: Number, required: true }, // e.g., 1–10

  type: {
    type: String,
    enum: ['vocabulary', 'grammar', 'mixed'],
    default: 'mixed'
  },

  questions: {
    type: [questionSchema],
    required: true
  },

  durationMinutes: {
    type: Number,
    default: 10 // Optional timer for test
  },

  createdBy: {
    type: String, // Firebase UID or admin name
    default: 'system'
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Test = mongoose.model('Test', testSchema);
module.exports = Test;
