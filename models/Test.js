// models/Test.js - FIXED Test Model

const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Question text is required'],
    trim: true
  },
  type: {
    type: String,
    enum: ['multiple-choice', 'true-false', 'short-answer'],
    default: 'multiple-choice'
  },
  options: [{
    text: {
      type: String,
      trim: true
    }
  }],
  correctAnswer: {
    type: mongoose.Schema.Types.Mixed, // Can be string, number, or boolean
    required: [true, 'Correct answer is required']
  },
  points: {
    type: Number,
    default: 1,
    min: [1, 'Points must be at least 1']
  },
  explanation: {
    type: String,
    trim: true,
    default: ''
  }
});

const testSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Test title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    default: '',
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true
  },
  level: {
    type: Number,
    required: [true, 'Level is required'],
    min: [1, 'Level must be at least 1'],
    max: [12, 'Level cannot exceed 12']
  },
  topic: {
    type: String,
    trim: true,
    default: ''
  },
  duration: {
    type: Number, // in minutes
    min: [1, 'Duration must be at least 1 minute'],
    max: [300, 'Duration cannot exceed 300 minutes'],
    default: null // null means no time limit
  },
  questions: {
    type: [questionSchema],
    validate: {
      validator: function(questions) {
        return questions && questions.length > 0;
      },
      message: 'At least one question is required'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  passingScore: {
    type: Number,
    default: 70,
    min: [0, 'Passing score cannot be negative'],
    max: [100, 'Passing score cannot exceed 100']
  },
  allowRetakes: {
    type: Boolean,
    default: true
  },
  showResults: {
    type: Boolean,
    default: true
  },
  randomizeQuestions: {
    type: Boolean,
    default: false
  },
  randomizeOptions: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: String, // Firebase UID
    default: 'admin'
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

// Indexes for better performance
testSchema.index({ subject: 1, level: 1 });
testSchema.index({ isActive: 1 });
testSchema.index({ createdAt: -1 });
testSchema.index({ title: 'text', description: 'text' }); // Text search

// Virtual for total points
testSchema.virtual('totalPoints').get(function() {
  return this.questions ? this.questions.reduce((total, question) => total + (question.points || 1), 0) : 0;
});

// Virtual for question count
testSchema.virtual('questionCount').get(function() {
  return this.questions ? this.questions.length : 0;
});

// Virtual for estimated duration based on question count if no duration set
testSchema.virtual('estimatedDuration').get(function() {
  if (this.duration) return this.duration;
  // Estimate 2 minutes per question
  return this.questions ? this.questions.length * 2 : 0;
});

// Pre-save middleware to update the updatedAt field
testSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

// Pre-update middleware
testSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Method to get public version (without correct answers for students)
testSchema.methods.getPublicVersion = function() {
  const testObj = this.toObject();
  
  // Remove correct answers and explanations from questions
  testObj.questions = testObj.questions.map(question => {
    const { correctAnswer, explanation, ...publicQuestion } = question;
    return publicQuestion;
  });
  
  return testObj;
};

// Static method to find tests by filters
testSchema.statics.findByFilters = function(filters = {}) {
  const query = {};
  
  if (filters.subject) query.subject = filters.subject;
  if (filters.level) query.level = filters.level;
  if (filters.isActive !== undefined) query.isActive = filters.isActive;
  
  return this.find(query).sort({ createdAt: -1 });
};

const Test = mongoose.model('Test', testSchema);

module.exports = Test;