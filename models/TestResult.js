// models/TestResult.js

const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionIndex: { type: Number, required: true },
  selectedAnswer: { type: String, required: true },
  isCorrect: { type: Boolean, default: false }
}, { _id: false });

const testResultSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // Firebase UID
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  score: { type: Number, required: true }, // 0–100 or raw
  stars: { type: Number, default: 0 }, // 0–3
  totalQuestions: { type: Number, required: true },
  correctCount: { type: Number, required: true },
  answers: { type: [answerSchema], default: [] },

  completedAt: {
    type: Date,
    default: Date.now
  }
});

testResultSchema.index({ userId: 1, testId: 1 }, { unique: false });

const TestResult = mongoose.model('TestResult', testResultSchema);
module.exports = TestResult;
