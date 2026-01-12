const mongoose = require('mongoose');

// ✅ Clean HomeworkProgress Schema - Model ONLY, no routes
const HomeworkProgressSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: [true, 'User ID is required']
  },
  
  // For lesson-based homework
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    default: null
  },
  
  // ✅ For standalone homework
  homeworkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Homework',
    default: null
  },
  
  // ✅ Metadata field for additional info
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  answers: [{
    questionIndex: {
      type: Number,
      required: true
    },
    userAnswer: {
      type: mongoose.Schema.Types.Mixed,
      default: ''
    },
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed,
      default: ''
    },
    isCorrect: {
      type: Boolean,
      default: false
    },
    points: {
      type: Number,
      default: 0
    },
    type: {
      type: String,
      enum: ['auto', 'manual'],
      default: 'auto'
    }
  }],
  
  completed: {
    type: Boolean,
    default: false
  },
  
  score: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  totalPoints: {
    type: Number,
    default: 0
  },
  
  maxPoints: {
    type: Number,
    default: 0
  },
  
  stars: {
    type: Number,
    min: 0,
    max: 3,
    default: 0
  },
  
  submittedAt: {
    type: Date,
    default: null
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
  collection: 'homeworkprogresses'
});

// ✅ Indexes for better performance
HomeworkProgressSchema.index({ userId: 1, lessonId: 1 });
HomeworkProgressSchema.index({ userId: 1, homeworkId: 1 });
HomeworkProgressSchema.index({ userId: 1 });
HomeworkProgressSchema.index({ completed: 1 });
HomeworkProgressSchema.index({ submittedAt: -1 });

// ✅ Validation to ensure either lessonId or homeworkId is present
HomeworkProgressSchema.pre('save', function(next) {
  if (!this.lessonId && !this.homeworkId) {
    return next(new Error('Either lessonId or homeworkId must be provided'));
  }
  this.updatedAt = new Date();
  next();
});

// ✅ Virtual to get the type of homework
HomeworkProgressSchema.virtual('homeworkType').get(function() {
  if (this.homeworkId) return 'standalone';
  if (this.lessonId) return 'lesson';
  return 'unknown';
});

// ✅ Virtual to check if homework is overdue (if there was a due date)
HomeworkProgressSchema.virtual('isOverdue').get(function() {
  if (!this.metadata?.dueDate) return false;
  return new Date() > new Date(this.metadata.dueDate);
});

// ✅ Instance method to calculate completion percentage
HomeworkProgressSchema.methods.getCompletionPercentage = function() {
  if (!this.answers || this.answers.length === 0) return 0;
  
  const answeredQuestions = this.answers.filter(answer => 
    answer.userAnswer && answer.userAnswer.toString().trim() !== ''
  ).length;
  
  return Math.round((answeredQuestions / this.answers.length) * 100);
};

// ✅ Instance method to get performance stats
HomeworkProgressSchema.methods.getPerformanceStats = function() {
  if (!this.completed || !this.answers) {
    return {
      score: this.score || 0,
      totalQuestions: this.answers?.length || 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      stars: this.stars || 0
    };
  }
  
  const correctAnswers = this.answers.filter(answer => answer.isCorrect).length;
  const totalQuestions = this.answers.length;
  const incorrectAnswers = totalQuestions - correctAnswers;
  
  return {
    score: this.score,
    totalQuestions,
    correctAnswers,
    incorrectAnswers,
    stars: this.stars,
    percentage: totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0
  };
};

// ✅ Static method to find progress by user
HomeworkProgressSchema.statics.findByUser = function(userId) {
  return this.find({ userId })
    .populate('lessonId', 'title lessonName subject')
    .populate('homeworkId', 'title subject level')
    .sort({ updatedAt: -1 });
};

// ✅ Static method to find completed homework
HomeworkProgressSchema.statics.findCompleted = function(userId = null) {
  const query = { completed: true };
  if (userId) query.userId = userId;
  
  return this.find(query)
    .populate('lessonId', 'title lessonName subject')
    .populate('homeworkId', 'title subject level')
    .sort({ submittedAt: -1 });
};

// ✅ Static method to get user statistics
HomeworkProgressSchema.statics.getUserStats = async function(userId) {
  const userProgress = await this.find({ userId });
  
  const completed = userProgress.filter(p => p.completed);
  const inProgress = userProgress.filter(p => !p.completed);
  
  const totalScore = completed.reduce((sum, p) => sum + (p.score || 0), 0);
  const avgScore = completed.length > 0 ? Math.round(totalScore / completed.length) : 0;
  const totalStars = completed.reduce((sum, p) => sum + (p.stars || 0), 0);
  
  return {
    total: userProgress.length,
    completed: completed.length,
    inProgress: inProgress.length,
    completionRate: userProgress.length > 0 ? Math.round((completed.length / userProgress.length) * 100) : 0,
    avgScore,
    totalStars,
    lastActivity: userProgress.length > 0 ? userProgress[0].updatedAt : null
  };
};

// ✅ Static method to clean up orphaned records
HomeworkProgressSchema.statics.cleanupOrphaned = async function() {
  const Lesson = mongoose.model('Lesson');
  const Homework = mongoose.model('Homework');
  
  const allProgress = await this.find({});
  const orphanedIds = [];
  
  for (const progress of allProgress) {
    let isValid = false;
    
    try {
      if (progress.lessonId) {
        const lessonExists = await Lesson.exists({ _id: progress.lessonId });
        isValid = !!lessonExists;
      }
      
      if (progress.homeworkId) {
        const homeworkExists = await Homework.exists({ _id: progress.homeworkId });
        isValid = !!homeworkExists;
      }
      
      if (!isValid) {
        orphanedIds.push(progress._id);
      }
    } catch (error) {
      orphanedIds.push(progress._id);
    }
  }
  
  if (orphanedIds.length > 0) {
    const result = await this.deleteMany({ _id: { $in: orphanedIds } });
    return result.deletedCount;
  }
  
  return 0;
};

// ✅ Transform function to clean up output
HomeworkProgressSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    // Add computed fields
    ret.performanceStats = doc.getPerformanceStats();
    ret.completionPercentage = doc.getCompletionPercentage();
    return ret;
  }
});

HomeworkProgressSchema.set('toObject', {
  virtuals: true
});

module.exports = mongoose.model('HomeworkProgress', HomeworkProgressSchema);