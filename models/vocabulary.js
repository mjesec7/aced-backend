// models/vocabulary.js - Main Vocabulary Model
const mongoose = require('mongoose');

const vocabularySchema = new mongoose.Schema({
  // Basic Information
  word: {
    type: String,
    required: true,
    trim: true
  },
  translation: {
    type: String,
    required: true,
    trim: true
  },
  pronunciation: {
    type: String,
    trim: true // IPA or phonetic spelling
  },
  
  // Language & Organization
  language: {
    type: String,
    required: true,
    enum: ['english', 'russian', 'uzbek', 'spanish', 'french', 'german', 'chinese', 'arabic', 'japanese', 'korean']
  },
  translationLanguage: {
    type: String,
    required: true,
    default: 'russian'
  },
  
  // Categorization
  subject: {
    type: String,
    required: true // e.g., 'English', 'Spanish', etc.
  },
  topic: {
    type: String,
    required: true // e.g., 'Travel', 'Business', 'Daily Life'
  },
  subtopic: {
    type: String,
    required: true // e.g., 'At the Airport', 'At the Hotel'
  },
  
  // Word Details
  partOfSpeech: {
    type: String,
    enum: ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'interjection', 'phrase', 'idiom'],
    required: true
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  
  // Additional Information
  definition: {
    type: String,
    trim: true // Detailed explanation in Russian
  },
  examples: [{
    sentence: String,
    translation: String
  }],
  synonyms: [String],
  antonyms: [String],
  
  // Audio & Media
  audioUrl: String,
  imageUrl: String,
  
  // Learning Metrics
  frequency: {
    type: Number,
    default: 0 // How often this word appears in texts
  },
  importance: {
    type: Number,
    default: 1,
    min: 1,
    max: 5 // 1-5 scale for importance
  },
  
  // Administrative
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: String,
    ref: 'User'
  },
  tags: [String], // Additional tags for searching
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for better performance
vocabularySchema.index({ language: 1, subject: 1, topic: 1, subtopic: 1 });
vocabularySchema.index({ word: 'text', translation: 'text', definition: 'text' });
vocabularySchema.index({ difficulty: 1, importance: -1 });

// Pre-save middleware
vocabularySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for search text
vocabularySchema.virtual('searchText').get(function() {
  return `${this.word} ${this.translation} ${this.definition}`.toLowerCase();
});

module.exports = mongoose.model('Vocabulary', vocabularySchema);

// models/vocabularyCategory.js - Category Organization Model
const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  nameRussian: {
    type: String,
    required: true,
    trim: true
  },
  language: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['subject', 'topic', 'subtopic'],
    required: true
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VocabularyCategory'
  },
  description: String,
  descriptionRussian: String,
  icon: String,
  color: String,
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  wordCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

categorySchema.index({ language: 1, type: 1, parentId: 1 });

module.exports.VocabularyCategory = mongoose.model('VocabularyCategory', categorySchema);

// models/vocabularyProgress.js - User Progress Tracking
const progressSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  vocabularyId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Vocabulary'
  },
  
  // Learning Progress
  status: {
    type: String,
    enum: ['new', 'learning', 'reviewing', 'mastered'],
    default: 'new'
  },
  
  // Test Results
  timesShown: {
    type: Number,
    default: 0
  },
  timesCorrect: {
    type: Number,
    default: 0
  },
  timesIncorrect: {
    type: Number,
    default: 0
  },
  
  // Spaced Repetition
  lastReviewed: Date,
  nextReview: Date,
  easeFactor: {
    type: Number,
    default: 2.5
  },
  interval: {
    type: Number,
    default: 1 // days
  },
  
  // Additional Metrics
  firstSeen: {
    type: Date,
    default: Date.now
  },
  timeSpent: {
    type: Number,
    default: 0 // in seconds
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

progressSchema.index({ userId: 1, vocabularyId: 1 }, { unique: true });
progressSchema.index({ userId: 1, status: 1, nextReview: 1 });

module.exports.VocabularyProgress = mongoose.model('VocabularyProgress', progressSchema);

// models/vocabularyDialogue.js - Dialogues for Context
const dialogueSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  titleRussian: {
    type: String,
    required: true,
    trim: true
  },
  
  // Organization
  language: {
    type: String,
    required: true
  },
  topic: {
    type: String,
    required: true
  },
  subtopic: {
    type: String,
    required: true
  },
  
  // Dialogue Content
  conversation: [{
    speaker: {
      type: String,
      required: true // A, B, Narrator, etc.
    },
    text: {
      type: String,
      required: true
    },
    translation: {
      type: String,
      required: true
    },
    audioUrl: String
  }],
  
  // Related Words
  vocabularyIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vocabulary'
  }],
  
  // Difficulty & Context
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  situation: {
    type: String,
    required: true // "At the airport check-in", "Ordering food"
  },
  
  // Audio & Media
  fullAudioUrl: String,
  imageUrl: String,
  
  // Administrative
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

dialogueSchema.index({ language: 1, topic: 1, subtopic: 1 });
dialogueSchema.index({ difficulty: 1, isActive: 1 });

module.exports.VocabularyDialogue = mongoose.model('VocabularyDialogue', dialogueSchema);