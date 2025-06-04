const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => `ex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  question: {
    type: String,
    required: true
  },
  instruction: {
    type: String,
    default: ''
  },
  options: [{
    type: String
  }],
  correctAnswer: {
    type: String,
    required: true
  },
  points: {
    type: Number,
    default: 1,
    min: 1
  },
  type: {
    type: String,
    enum: ['multiple-choice', 'short-answer', 'true-false', 'abc', 'qa'],
    default: 'multiple-choice'
  }
}, { _id: false });

const homeworkSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  level: {
    type: mongoose.Schema.Types.Mixed, // Can be string or number
    required: true
  },
  instructions: {
    type: String,
    default: '',
    trim: true
  },
  dueDate: {
    type: Date,
    default: null
  },
  linkedLessonIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson'
  }],
  exercises: [exerciseSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  difficulty: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  estimatedDuration: {
    type: Number, // in minutes
    default: 30
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for total points
homeworkSchema.virtual('totalPoints').get(function() {
  return this.exercises.reduce((total, exercise) => total + (exercise.points || 1), 0);
});

// Virtual for question count
homeworkSchema.virtual('questionCount').get(function() {
  return this.exercises.length;
});

// Index for efficient queries
homeworkSchema.index({ subject: 1, level: 1 });
homeworkSchema.index({ isActive: 1 });
homeworkSchema.index({ createdAt: -1 });

// Update the updatedAt field before saving
homeworkSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Update the updatedAt field before updating
homeworkSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

const Homework = mongoose.model('Homework', homeworkSchema);

module.exports = Homework;