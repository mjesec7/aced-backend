// models/TestResult.js - FIXED TestResult Model

const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionIndex: {
    type: Number,
    required: true
  },
  question: {
    type: String,
    required: true
  },
  userAnswer: {
    type: mongoose.Schema.Types.Mixed // Can be string, number, or boolean
  },
  correctAnswer: {
    type: mongoose.Schema.Types.Mixed
  },
  isCorrect: {
    type: Boolean,
    required: true
  },
  points: {
    type: Number,
    default: 0
  }
}, { _id: false });

const testResultSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    trim: true
  },
  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: [true, 'Test ID is required']
  },
  answers: {
    type: [answerSchema],
    required: true,
    validate: {
      validator: function(answers) {
        return answers && answers.length > 0;
      },
      message: 'At least one answer is required'
    }
  },
  score: {
    type: Number,
    required: true,
    min: [0, 'Score cannot be negative'],
    max: [100, 'Score cannot exceed 100']
  },
  totalPoints: {
    type: Number,
    default: 0,
    min: [0, 'Total points cannot be negative']
  },
  maxPossiblePoints: {
    type: Number,
    default: function() {
      return this.answers ? this.answers.length : 0;
    }
  },
  passed: {
    type: Boolean,
    default: function() {
      return this.score >= 70; // Default passing score
    }
  },
  timeSpent: {
    type: Number, // in minutes
    min: [0, 'Time spent cannot be negative']
  },
  submittedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  ip: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
testResultSchema.index({ userId: 1, testId: 1 }); // Compound index for user-test lookups
testResultSchema.index({ testId: 1, submittedAt: -1 }); // For test statistics
testResultSchema.index({ userId: 1, submittedAt: -1 }); // For user history
testResultSchema.index({ submittedAt: -1 }); // For recent submissions

// Virtual for correct answers count
testResultSchema.virtual('correctAnswersCount').get(function() {
  return this.answers ? this.answers.filter(answer => answer.isCorrect).length : 0;
});

// Virtual for total questions count
testResultSchema.virtual('totalQuestions').get(function() {
  return this.answers ? this.answers.length : 0;
});

// Virtual for percentage
testResultSchema.virtual('percentage').get(function() {
  return this.score || 0;
});

// Static method to get user statistics
testResultSchema.statics.getUserStats = async function(userId) {
  const results = await this.find({ userId }).populate('testId', 'title subject');
  
  if (results.length === 0) {
    return {
      totalTests: 0,
      averageScore: 0,
      passedTests: 0,
      failedTests: 0,
      recentResults: []
    };
  }
  
  const totalTests = results.length;
  const averageScore = results.reduce((sum, result) => sum + result.score, 0) / totalTests;
  const passedTests = results.filter(result => result.passed).length;
  const failedTests = totalTests - passedTests;
  const recentResults = results
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .slice(0, 5);
  
  return {
    totalTests,
    averageScore: Math.round(averageScore),
    passedTests,
    failedTests,
    recentResults
  };
};

// Static method to get test statistics
testResultSchema.statics.getTestStats = async function(testId) {
  const results = await this.find({ testId });
  
  if (results.length === 0) {
    return {
      totalSubmissions: 0,
      averageScore: 0,
      passRate: 0,
      recentSubmissions: []
    };
  }
  
  const totalSubmissions = results.length;
  const averageScore = results.reduce((sum, result) => sum + result.score, 0) / totalSubmissions;
  const passedSubmissions = results.filter(result => result.passed).length;
  const passRate = (passedSubmissions / totalSubmissions) * 100;
  const recentSubmissions = results
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .slice(0, 10);
  
  return {
    totalSubmissions,
    averageScore: Math.round(averageScore),
    passRate: Math.round(passRate),
    recentSubmissions
  };
};

const TestResult = mongoose.model('TestResult', testResultSchema);

module.exports = TestResult;