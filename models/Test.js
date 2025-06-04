const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  text: {
    type: String,
    required: true,
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
      required: true
    }
  }],
  correctAnswer: {
    type: mongoose.Schema.Types.Mixed, // Can be string, number, or boolean
    required: true
  },
  points: {
    type: Number,
    default: 1,
    min: 1
  },
  explanation: {
    type: String,
    default: ''
  }
}, { _id: false });

const testSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  topic: {
    type: String,
    default: '',
    trim: true
  },
  duration: {
    type: Number, // in minutes
    default: null // null means no time limit
  },
  questions: [questionSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  passingScore: {
    type: Number,
    default: 70,
    min: 0,
    max: 100
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

// Virtual for total points
testSchema.virtual('totalPoints').get(function() {
  return this.questions.reduce((total, question) => total + (question.points || 1), 0);
});

// Virtual for question count
testSchema.virtual('questionCount').get(function() {
  return this.questions.length;
});

// Virtual for estimated duration based on question count if no duration set
testSchema.virtual('estimatedDuration').get(function() {
  if (this.duration) return this.duration;
  // Estimate 2 minutes per question
  return this.questions.length * 2;
});

// Index for efficient queries
testSchema.index({ subject: 1, level: 1 });
testSchema.index({ isActive: 1 });
testSchema.index({ createdAt: -1 });
testSchema.index({ topic: 1 });

// Update the updatedAt field before saving
testSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Update the updatedAt field before updating
testSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Method to get public version (without correct answers)
testSchema.methods.getPublicVersion = function() {
  const testObj = this.toObject();
  
  // Remove correct answers from questions
  testObj.questions = testObj.questions.map(question => {
    const { correctAnswer, explanation, ...publicQuestion } = question;
    return publicQuestion;
  });
  
  return testObj;
};

const Test = mongoose.model('Test', testSchema);

module.exports = Test;