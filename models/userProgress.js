// models/userProgress.js
const mongoose = require('mongoose');

const userProgressSchema = new mongoose.Schema({
  userId: {
    type: String, // Firebase UID
    required: [true, 'User ID is required'],
    trim: true,
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'User ID cannot be empty'
    }
  },
  
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    required: [true, 'Lesson ID is required'],
    validate: {
      validator: function(v) {
        return mongoose.Types.ObjectId.isValid(v);
      },
      message: 'Invalid lesson ID format'
    }
  },
  
  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    required: [true, 'Topic ID is required for proper tracking'],
    validate: {
      validator: function(v) {
        return mongoose.Types.ObjectId.isValid(v);
      },
      message: 'Invalid topic ID format'
    }
  },
  
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    validate: {
      validator: function(v) {
        return !v || mongoose.Types.ObjectId.isValid(v);
      },
      message: 'Invalid subject ID format'
    }
  },
  
  completedSteps: {
    type: [Number],
    default: [],
    validate: {
      validator: function(arr) {
        return Array.isArray(arr) && arr.every(step => 
          Number.isInteger(step) && step >= 0
        );
      },
      message: 'Completed steps must be an array of non-negative integers'
    }
  },
  
  totalSteps: {
    type: Number,
    default: 0,
    min: [0, 'Total steps cannot be negative']
  },
  
  progressPercent: {
    type: Number,
    default: 0,
    min: [0, 'Progress cannot be negative'],
    max: [100, 'Progress cannot exceed 100%'],
    validate: {
      validator: function(v) {
        return !isNaN(v) && isFinite(v);
      },
      message: 'Progress percent must be a valid number'
    }
  },
  
  completed: {
    type: Boolean,
    default: false
  },
  
  medal: {
    type: String,
    enum: {
      values: ['none', 'bronze', 'silver', 'gold'],
      message: 'Medal must be one of: none, bronze, silver, gold'
    },
    default: 'none'
  },
  
  stars: {
    type: Number,
    enum: {
      values: [0, 1, 2, 3],
      message: 'Stars must be between 0 and 3'
    },
    default: 0
  },
  
  points: {
    type: Number,
    default: 0,
    min: [0, 'Points cannot be negative'],
    validate: {
      validator: function(v) {
        return Number.isInteger(v);
      },
      message: 'Points must be an integer'
    }
  },
  
  mistakes: {
    type: Number,
    default: 0,
    min: [0, 'Mistakes cannot be negative'],
    validate: {
      validator: function(v) {
        return Number.isInteger(v);
      },
      message: 'Mistakes must be an integer'
    }
  },
  
  hintsUsed: {
    type: Number,
    default: 0,
    min: [0, 'Hints used cannot be negative'],
    validate: {
      validator: function(v) {
        return Number.isInteger(v);
      },
      message: 'Hints used must be an integer'
    }
  },
  
  submittedHomework: {
    type: Boolean,
    default: false
  },
  
  homeworkScore: {
    type: Number,
    min: [0, 'Homework score cannot be negative'],
    max: [100, 'Homework score cannot exceed 100'],
    validate: {
      validator: function(v) {
        return v === null || v === undefined || (!isNaN(v) && isFinite(v));
      },
      message: 'Homework score must be a valid number'
    }
  },
  
  completedAt: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v instanceof Date;
      },
      message: 'Completed at must be a valid date'
    }
  },
  
  startedAt: {
    type: Date,
    default: Date.now
  },
  
  lastAccessedAt: {
    type: Date,
    default: Date.now
  },
  
  duration: {
    type: Number,
    default: 0,
    min: [0, 'Duration cannot be negative'],
    validate: {
      validator: function(v) {
        return Number.isInteger(v);
      },
      message: 'Duration must be an integer (seconds)'
    }
  },
  
  // Performance metrics
  accuracy: {
    type: Number,
    min: [0, 'Accuracy cannot be negative'],
    max: [100, 'Accuracy cannot exceed 100%'],
    default: 0
  },
  
  attemptsCount: {
    type: Number,
    default: 1,
    min: [1, 'Attempts count must be at least 1']
  },
  
  // Session data
  sessionData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Streak tracking
  currentStreak: {
    type: Number,
    default: 0,
    min: [0, 'Current streak cannot be negative']
  },
  
  bestStreak: {
    type: Number,
    default: 0,
    min: [0, 'Best streak cannot be negative']
  }
}, { 
  timestamps: true,
  // Optimize queries
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// ========================================
// 🔍 INDEXES FOR PERFORMANCE
// ========================================

// Unique constraint to prevent duplicate progress entries
userProgressSchema.index({ userId: 1, lessonId: 1 }, { 
  unique: true,
  name: 'unique_user_lesson_progress'
});

// Performance indexes
userProgressSchema.index({ userId: 1, topicId: 1 }, { name: 'user_topic_lookup' });
userProgressSchema.index({ userId: 1, completed: 1 }, { name: 'user_completion_status' });
userProgressSchema.index({ userId: 1, subjectId: 1 }, { name: 'user_subject_lookup' });
userProgressSchema.index({ topicId: 1, completed: 1 }, { name: 'topic_completion_stats' });
userProgressSchema.index({ completedAt: -1 }, { name: 'recent_completions' });
userProgressSchema.index({ lastAccessedAt: -1 }, { name: 'recent_activity' });

// Compound indexes for complex queries
userProgressSchema.index({ 
  userId: 1, 
  topicId: 1, 
  completed: 1 
}, { name: 'user_topic_completion' });

// ========================================
// 🧮 VIRTUAL FIELDS
// ========================================

// Calculate completion percentage based on steps
userProgressSchema.virtual('stepCompletionPercent').get(function() {
  if (this.totalSteps === 0) return 0;
  return Math.round((this.completedSteps.length / this.totalSteps) * 100);
});

// Calculate time spent in minutes
userProgressSchema.virtual('durationMinutes').get(function() {
  return Math.round(this.duration / 60);
});

// Check if recently accessed (within last 24 hours)
userProgressSchema.virtual('isRecentlyAccessed').get(function() {
  if (!this.lastAccessedAt) return false;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.lastAccessedAt > oneDayAgo;
});

// ========================================
// 📊 STATIC METHODS FOR ANALYTICS
// ========================================

// Enhanced topic progress calculation with error handling
userProgressSchema.statics.calculateTopicProgress = async function(userId, topicId) {
  try {
    // Validate inputs
    if (!userId || !topicId) {
      throw new Error('userId and topicId are required');
    }

    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      throw new Error('Invalid topicId format');
    }

    // Get all lessons for this topic
    const Lesson = mongoose.model('Lesson');
    const totalLessons = await Lesson.countDocuments({ 
      topicId: new mongoose.Types.ObjectId(topicId) 
    });
    
    if (totalLessons === 0) {
      console.log(`No lessons found for topic ${topicId}`);
      return 0;
    }
    
    // Get completed lessons for this user and topic
    const completedLessons = await this.countDocuments({
      userId: userId.toString(),
      topicId: new mongoose.Types.ObjectId(topicId),
      completed: true
    });
    
    // Calculate percentage
    const progressPercent = Math.round((completedLessons / totalLessons) * 100);
    const result = Math.min(progressPercent, 100);
    
    console.log(`Topic progress for ${userId}: ${completedLessons}/${totalLessons} = ${result}%`);
    return result;
    
  } catch (error) {
    console.error('Error calculating topic progress:', error.message);
    return 0;
  }
};

// Get comprehensive topic progress with metadata
userProgressSchema.statics.getTopicProgressDetails = async function(userId, topicId) {
  try {
    if (!userId || !topicId) {
      throw new Error('userId and topicId are required');
    }

    const Lesson = mongoose.model('Lesson');
    
    // Get all lessons for topic
    const lessons = await Lesson.find({ topicId }).select('_id title');
    const totalLessons = lessons.length;
    
    if (totalLessons === 0) {
      return {
        progressPercent: 0,
        totalLessons: 0,
        completedLessons: 0,
        inProgressLessons: 0,
        lessons: []
      };
    }
    
    // Get user progress for all lessons in topic
    const progressData = await this.find({
      userId: userId.toString(),
      topicId: new mongoose.Types.ObjectId(topicId)
    }).populate('lessonId', 'title');
    
    const completedCount = progressData.filter(p => p.completed).length;
    const inProgressCount = progressData.filter(p => !p.completed && p.progressPercent > 0).length;
    
    return {
      progressPercent: Math.round((completedCount / totalLessons) * 100),
      totalLessons,
      completedLessons: completedCount,
      inProgressLessons: inProgressCount,
      lessons: progressData,
      totalPoints: progressData.reduce((sum, p) => sum + p.points, 0),
      averageStars: progressData.length > 0 
        ? progressData.reduce((sum, p) => sum + p.stars, 0) / progressData.length 
        : 0
    };
    
  } catch (error) {
    console.error('Error getting topic progress details:', error.message);
    throw error;
  }
};

// Get all topic progress for a user with enhanced data
userProgressSchema.statics.getAllTopicProgress = async function(userId) {
  try {
    if (!userId) {
      throw new Error('userId is required');
    }

    // Get all topics that have lessons
    const Lesson = mongoose.model('Lesson');
    const topicsWithLessons = await Lesson.aggregate([
      { 
        $group: { 
          _id: '$topicId', 
          totalLessons: { $sum: 1 },
          lessonIds: { $push: '$_id' }
        } 
      },
      { $match: { _id: { $ne: null } } },
      { 
        $lookup: {
          from: 'topics',
          localField: '_id',
          foreignField: '_id',
          as: 'topicInfo'
        }
      },
      {
        $unwind: {
          path: '$topicInfo',
          preserveNullAndEmptyArrays: true
        }
      }
    ]);
    
    const progressMap = {};
    
    for (const topic of topicsWithLessons) {
      const topicId = topic._id.toString();
      const totalLessons = topic.totalLessons;
      
      // Get user progress for this topic
      const topicProgress = await this.find({
        userId: userId.toString(),
        topicId: topic._id
      });
      
      const completedLessons = topicProgress.filter(p => p.completed).length;
      const inProgressLessons = topicProgress.filter(p => !p.completed && p.progressPercent > 0).length;
      const totalPoints = topicProgress.reduce((sum, p) => sum + p.points, 0);
      const totalStars = topicProgress.reduce((sum, p) => sum + p.stars, 0);
      
      // Calculate percentage
      const progressPercent = totalLessons > 0 
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;
      
      progressMap[topicId] = {
        progressPercent: Math.min(progressPercent, 100),
        totalLessons,
        completedLessons,
        inProgressLessons,
        totalPoints,
        totalStars,
        averageStars: topicProgress.length > 0 ? totalStars / topicProgress.length : 0,
        topicName: topic.topicInfo?.name || 'Unknown Topic',
        lastAccessed: topicProgress.length > 0 
          ? Math.max(...topicProgress.map(p => p.lastAccessedAt?.getTime() || 0))
          : null
      };
    }
    
    return progressMap;
    
  } catch (error) {
    console.error('Error getting all topic progress:', error.message);
    return {};
  }
};

// Get user's overall progress statistics
userProgressSchema.statics.getUserStats = async function(userId) {
  try {
    if (!userId) {
      throw new Error('userId is required');
    }

    const stats = await this.aggregate([
      { $match: { userId: userId.toString() } },
      {
        $group: {
          _id: null,
          totalLessons: { $sum: 1 },
          completedLessons: { $sum: { $cond: ['$completed', 1, 0] } },
          totalPoints: { $sum: '$points' },
          totalStars: { $sum: '$stars' },
          totalMistakes: { $sum: '$mistakes' },
          totalHints: { $sum: '$hintsUsed' },
          totalDuration: { $sum: '$duration' },
          goldMedals: { $sum: { $cond: [{ $eq: ['$medal', 'gold'] }, 1, 0] } },
          silverMedals: { $sum: { $cond: [{ $eq: ['$medal', 'silver'] }, 1, 0] } },
          bronzeMedals: { $sum: { $cond: [{ $eq: ['$medal', 'bronze'] }, 1, 0] } },
          perfectScores: { $sum: { $cond: [{ $eq: ['$stars', 3] }, 1, 0] } }
        }
      }
    ]);

    const result = stats[0] || {
      totalLessons: 0,
      completedLessons: 0,
      totalPoints: 0,
      totalStars: 0,
      totalMistakes: 0,
      totalHints: 0,
      totalDuration: 0,
      goldMedals: 0,
      silverMedals: 0,
      bronzeMedals: 0,
      perfectScores: 0
    };

    // Calculate additional metrics
    result.completionRate = result.totalLessons > 0 
      ? Math.round((result.completedLessons / result.totalLessons) * 100) 
      : 0;
    
    result.averageStars = result.completedLessons > 0 
      ? Math.round((result.totalStars / result.completedLessons) * 100) / 100
      : 0;
    
    result.accuracy = result.totalLessons > 0 && (result.totalMistakes + result.completedLessons) > 0
      ? Math.round((result.completedLessons / (result.totalMistakes + result.completedLessons)) * 100)
      : 0;

    result.totalDurationMinutes = Math.round(result.totalDuration / 60);
    
    delete result._id;
    return result;
    
  } catch (error) {
    console.error('Error getting user stats:', error.message);
    throw error;
  }
};

// ========================================
// 📈 INSTANCE METHODS
// ========================================

// Enhanced completion marking with validation
userProgressSchema.methods.markCompleted = async function(additionalData = {}) {
  try {
    this.completed = true;
    this.progressPercent = 100;
    this.completedAt = new Date();
    this.lastAccessedAt = new Date();
    
    // Apply additional data if provided
    Object.keys(additionalData).forEach(key => {
      if (this.schema.paths[key] && additionalData[key] !== undefined) {
        this[key] = additionalData[key];
      }
    });
    
    // Auto-calculate medal based on performance
    if (additionalData.autoCalculateMedal !== false) {
      this.calculateMedal();
    }
    
    const result = await this.save();
    console.log(`Lesson completed: ${this.lessonId} by user ${this.userId}`);
    return result;
    
  } catch (error) {
    console.error('Error marking lesson as completed:', error.message);
    throw error;
  }
};

// Calculate medal based on performance
userProgressSchema.methods.calculateMedal = function() {
  const mistakeRatio = this.mistakes / Math.max(this.completedSteps.length, 1);
  const hintRatio = this.hintsUsed / Math.max(this.completedSteps.length, 1);
  
  if (this.stars === 3 && mistakeRatio === 0) {
    this.medal = 'gold';
  } else if (this.stars >= 2 && mistakeRatio <= 0.1) {
    this.medal = 'silver';
  } else if (this.completed && mistakeRatio <= 0.3) {
    this.medal = 'bronze';
  } else {
    this.medal = 'none';
  }
  
  return this.medal;
};

// Update progress with validation
userProgressSchema.methods.updateProgress = async function(updateData) {
  try {
    // Validate and update fields
    Object.keys(updateData).forEach(key => {
      if (this.schema.paths[key] && updateData[key] !== undefined) {
        this[key] = updateData[key];
      }
    });
    
    // Update last accessed time
    this.lastAccessedAt = new Date();
    
    // Recalculate progress if steps changed
    if (updateData.completedSteps && this.totalSteps > 0) {
      this.progressPercent = Math.round((this.completedSteps.length / this.totalSteps) * 100);
    }
    
    return await this.save();
    
  } catch (error) {
    console.error('Error updating progress:', error.message);
    throw error;
  }
};

// ========================================
// 🔄 MIDDLEWARE HOOKS
// ========================================

// Pre-save validation and auto-calculations
userProgressSchema.pre('save', function(next) {
  try {
    // Auto-mark as completed if progress is 100%
    if (this.progressPercent >= 100 && !this.completed) {
      this.completed = true;
      this.completedAt = new Date();
    }
    
    // Ensure progressPercent is within bounds
    this.progressPercent = Math.max(0, Math.min(100, this.progressPercent));
    
    // Update last accessed time if not set
    if (!this.lastAccessedAt) {
      this.lastAccessedAt = new Date();
    }
    
    // Calculate accuracy if we have data
    if (this.mistakes >= 0 && this.completedSteps.length > 0) {
      const totalAttempts = this.completedSteps.length + this.mistakes;
      this.accuracy = totalAttempts > 0 
        ? Math.round((this.completedSteps.length / totalAttempts) * 100)
        : 0;
    }
    
    // Auto-calculate medal if completed
    if (this.completed && this.medal === 'none') {
      this.calculateMedal();
    }
    
    next();
    
  } catch (error) {
    next(error);
  }
});

// Post-save hook for logging
userProgressSchema.post('save', function(doc) {
  console.log(`Progress saved: ${doc.userId} - Lesson ${doc.lessonId} - ${doc.progressPercent}%`);
});

// Handle duplicate key errors gracefully
userProgressSchema.post('save', function(error, doc, next) {
  if (error.name === 'MongoError' && error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    next(new Error(`Duplicate ${field}: ${error.keyValue[field]} already exists`));
  } else {
    next(error);
  }
});

// ========================================
// 🔄 EXPORT MODEL
// ========================================

module.exports = mongoose.model('UserProgress', userProgressSchema);