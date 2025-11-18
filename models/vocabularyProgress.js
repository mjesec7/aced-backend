const mongoose = require('mongoose');

const vocabularyProgressSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  wordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vocabulary' },
  term: String,
  status: { type: String, enum: ['new', 'learning', 'review', 'mastered'], default: 'new' },
  nextReview: Date,
  strength: { type: Number, default: 0 },
  lastPracticed: Date
}, { timestamps: true });

module.exports = mongoose.model('VocabularyProgress', vocabularyProgressSchema);
