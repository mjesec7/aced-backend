const mongoose = require('mongoose');

const vocabularyProgressSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  wordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vocabulary' },
  term: String,
  status: { type: String, enum: ['new', 'learning', 'review', 'mastered'], default: 'new' },
  nextReview: { type: Date, default: Date.now },
  strength: { type: Number, default: 0 },
  lastPracticed: { type: Date, default: Date.now },
  history: [{
    date: { type: Date, default: Date.now },
    result: String // 'correct' | 'incorrect'
  }]
}, { timestamps: true });

// ✅ Check if model already exists to prevent "Cannot overwrite model" errors
const VocabularyProgress = mongoose.models.VocabularyProgress ||
  mongoose.model('VocabularyProgress', vocabularyProgressSchema);

module.exports = VocabularyProgress;
