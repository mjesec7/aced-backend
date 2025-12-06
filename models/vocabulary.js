const mongoose = require('mongoose');

const vocabularySchema = new mongoose.Schema({
  word: { type: String, required: true, trim: true },
  translation: { type: String, required: true, trim: true },
  pronunciation: { type: String, trim: true },
  language: { type: String, required: true },
  translationLanguage: { type: String, default: 'russian' },
  subject: { type: String },
  topic: { type: String },
  subtopic: { type: String },
  partOfSpeech: { type: String },
  difficulty: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
  definition: String,
  examples: [{ sentence: String, translation: String }],
  audioUrl: String,
  imageUrl: String,
  isActive: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ✅ FIX: Check if model exists before compiling
const Vocabulary = mongoose.models.Vocabulary || mongoose.model('Vocabulary', vocabularySchema);

module.exports = Vocabulary;
