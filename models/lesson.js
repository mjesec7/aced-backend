// models/lesson.js - FULLY UPDATED & ENHANCED MODEL
const mongoose = require('mongoose');

// =================================================================
// 🧱 SUB-SCHEMAS: Building blocks for the main lesson schema
// =================================================================

// ✅ ENHANCED: A flexible schema for various exercise types.
// This schema now includes specific fields for matching, fill-in-the-blank,
// error correction, and more, making it highly adaptable.
const exerciseSchema = new mongoose.Schema({
  // --- Core Fields ---
  type: { type: String, default: 'short-answer', trim: true }, // e.g., 'multiple-choice', 'fill-blank', 'matching'
  question: { type: String, required: true, trim: true },
  instruction: { type: String, default: '', trim: true },

  // --- Answer Fields ---
  answer: { type: String, trim: true }, // For simple short-answer
  correctAnswer: { type: mongoose.Schema.Types.Mixed }, // Can be a string, number (index), or boolean

  // --- Type-Specific Fields ---
  options: { type: [mongoose.Schema.Types.Mixed], default: [] }, // For multiple-choice, can be strings or {text, value} objects
  template: { type: String, trim: true }, // For fill-blank, e.g., "He ___ to the store."
  blanks: { type: [mongoose.Schema.Types.Mixed], default: [] }, // For fill-blank answers
  pairs: { type: [mongoose.Schema.Types.Mixed], default: [] }, // For matching, e.g., [{left, right}]
  items: { type: [String], default: [] }, // For ordering exercises
  statement: { type: String, trim: true }, // For true-false exercises
  dragItems: { type: [String], default: [] }, // For drag-and-drop
  dropZones: { type: [String], default: [] }, // For drag-and-drop
  correctSentence: { type: String, trim: true }, // For error-correction

  // --- Metadata ---
  points: { type: Number, default: 1 },
  includeInHomework: { type: Boolean, default: false },
  hint: { type: String, default: '', trim: true },
  explanation: { type: String, default: '', trim: true }
}, { _id: false });

// ✅ Standardized Quiz schema
const quizSchema = new mongoose.Schema({
  question: { type: String, required: true },
  type: {
    type: String,
    enum: ['multiple-choice', 'true-false', 'short-answer'],
    default: 'multiple-choice'
  },
  options: { type: [mongoose.Schema.Types.Mixed], default: [] },
  correctAnswer: { type: mongoose.Schema.Types.Mixed, required: true },
  explanation: { type: String, default: '' }
}, { _id: false });

// ✅ Standardized Vocabulary schema
const vocabSchema = new mongoose.Schema({
  term: { type: String, required: true },
  definition: { type: String, required: true },
  example: { type: String, default: '' },
  pronunciation: { type: String, default: '' }
}, { _id: false });

// ✅ ENHANCED: The core Step schema using Mixed type for maximum flexibility.
// This allows any data structure within a step, accommodating all current
// and future exercise and content types.
const stepSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'explanation', 'example', 'practice', 'exercise',
      'vocabulary', 'quiz', 'video', 'audio',
      'reading', 'writing', 'image' // Added 'image' type
    ]
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    validate: {
      validator: function(data) {
        // Basic validation: ensure data is not null or undefined
        if (data === null || data === undefined) return false;
        // Ensure data is an object or an array, not just a primitive (unless it's a simple explanation)
        if (typeof data !== 'object' && this.type !== 'explanation') return false;
        return true;
      },
      message: '❌ Invalid data format for the given step type.'
    }
  }
}, { _id: false });

// =================================================================
// 📖 MAIN LESSON SCHEMA
// =================================================================

const lessonSchema = new mongoose.Schema({
  // --- Core Identification ---
  subject: { type: String, required: true, trim: true, index: true },
  level: { type: Number, required: true, min: 1, max: 12 },
  topic: { type: String, required: true, trim: true },
  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Topic',
    index: true
  },
  lessonName: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free'
  },

  // --- Content Structure ---
  steps: {
    type: [stepSchema],
    default: [],
    validate: [ (val) => val.length > 0, '❌ A lesson must have at least one step.' ]
  },

  // --- Legacy Content Fields (for backward compatibility) ---
  explanations: { type: [String], default: [] },
  quiz: { type: [quizSchema], default: [] },

  // --- Homework (Embedded Summary) ---
  homework: {
    exercises: { type: [exerciseSchema], default: [] },
    quizzes: { type: [quizSchema], default: [] },
    totalExercises: { type: Number, default: 0 }
  },

  // --- Metadata & Relations ---
  relatedSubjects: { type: [String], default: [] },
  translations: { type: mongoose.Schema.Types.Mixed, default: {} },
  metadata: {
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner'
    },
    estimatedDuration: { type: Number, default: 20 }, // in minutes
    prerequisites: { type: [String], default: [] },
    learningObjectives: { type: [String], default: [] }
  },

  // --- Analytics & Stats ---
  stats: {
    viewCount: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 }
  },

  // --- Status & Timestamps ---
  isActive: { type: Boolean, default: true, index: true },
  isDraft: { type: Boolean, default: false },
  publishedAt: { type: Date },

}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
  strict: true,     // Ensures no unexpected fields are saved
  toJSON: { virtuals: true },   // Include virtuals when converting to JSON
  toObject: { virtuals: true } // Include virtuals when converting to Object
});

// =================================================================
// ⚡ VIRTUALS: Computed properties for convenience
// =================================================================

// ✅ Virtual for a quick homework count
lessonSchema.virtual('homeworkCount').get(function() {
  return this.homework?.totalExercises || 0;
});

// =================================================================
// ⚙️ MIDDLEWARE (HOOKS): Logic that runs on certain actions
// =================================================================

// ✅ Pre-save middleware to automatically calculate totals and set dates
lessonSchema.pre('save', function(next) {
  // Automatically calculate the total number of homework exercises
  if (this.isModified('homework')) {
    this.homework.totalExercises = (this.homework.exercises?.length || 0) + (this.homework.quizzes?.length || 0);
  }

  // Set the published date automatically when a lesson goes live
  if (this.isModified('isDraft') && !this.isDraft && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  next();
});

// =================================================================
//  STATIC & INSTANCE METHODS: Custom model functions
// =================================================================

// ✅ Static method to find all lessons that have associated homework
lessonSchema.statics.findWithHomework = function() {
  return this.find({
    $or: [
      { 'homework.exercises.0': { $exists: true } },
      { 'homework.quizzes.0': { $exists: true } }
    ]
  });
};

// ✅ Instance method to extract all exercises suitable for a standalone homework assignment
lessonSchema.methods.extractHomework = function() {
  const homeworkItems = [];

  // Extract from steps marked for homework
  this.steps.forEach(step => {
    if (step.type === 'exercise' && Array.isArray(step.data)) {
      step.data.forEach(exercise => {
        if (exercise.includeInHomework) {
          homeworkItems.push(exercise);
        }
      });
    }
    // Also extract quizzes as homework items
    if (step.type === 'quiz' && Array.isArray(step.data)) {
      homeworkItems.push(...step.data);
    }
  });

  // Include legacy homework as well
  if (this.homework?.exercises) homeworkItems.push(...this.homework.exercises);
  if (this.homework?.quizzes) homeworkItems.push(...this.homework.quizzes);

  return homeworkItems;
};

// =================================================================
// 🚀 EXPORT
// =================================================================

const Lesson = mongoose.model('Lesson', lessonSchema);
module.exports = Lesson;