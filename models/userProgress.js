// models/userProgress.js
const mongoose = require('mongoose');

const userProgressSchema = new mongoose.Schema({
  userId: {
    type: String, // Firebase UID
    required: true
  },
  
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    required: true
  },
  
  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    required: true // Make this required for proper topic tracking
  },
  
  completedSteps: {
    type: [Number], // e.g., [0, 1, 2]
    default: []
  },
  
  progressPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  completed: {
    type: Boolean,
    default: false
  },
  
  medal: {
    type: String,
    enum: ['none', 'bronze', 'silver', 'gold'],
    default: 'none'
  },
  
  stars: {
    type: Number,
    enum: [0, 1, 2, 3],
    default: 0
  },
  
  points: {
    type: Number,
    default: 0
  },
  
  mistakes: {
    type: Number,
    default: 0
  },
  
  hintsUsed: {
    type: Number,
    default: 0
  },
  
  submittedHomework: {
    type: Boolean,
    default: false
  },
  
  completedAt: {
    type: Date
  },
  
  duration: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Indexes for better performance
userProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });
userProgressSchema.index({ userId: 1, topicId: 1 });
userProgressSchema.index({ userId: 1, completed: 1 });

// Static method to calculate topic progress for a user
userProgressSchema.statics.calculateTopicProgress = async function(userId, topicId) {
  try {
    // Get all lessons for this topic
    const Lesson = mongoose.model('Lesson');
    const totalLessons = await Lesson.countDocuments({ topicId: topicId });
    
    if (totalLessons === 0) {
      return 0;
    }
    
    // Get completed lessons for this user and topic
    const completedLessons = await this.countDocuments({
      userId: userId,
      topicId: topicId,
      completed: true
    });
    
    // Calculate percentage
    const progressPercent = Math.round((completedLessons / totalLessons) * 100);
    return Math.min(progressPercent, 100); // Cap at 100%
  } catch (error) {
    console.error('Error calculating topic progress:', error);
    return 0;
  }
};

// Static method to get all topic progress for a user
userProgressSchema.statics.getAllTopicProgress = async function(userId) {
  try {
    // Get all topics that have lessons
    const Lesson = mongoose.model('Lesson');
    const topicsWithLessons = await Lesson.aggregate([
      { $group: { _id: '$topicId', totalLessons: { $sum: 1 } } },
      { $match: { _id: { $ne: null } } }
    ]);
    
    const progressMap = {};
    
    for (const topic of topicsWithLessons) {
      const topicId = topic._id.toString();
      const totalLessons = topic.totalLessons;
      
      // Get completed lessons for this topic
      const completedLessons = await this.countDocuments({
        userId: userId,
        topicId: topic._id,
        completed: true
      });
      
      // Calculate percentage
      const progressPercent = totalLessons > 0 
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;
      
      progressMap[topicId] = Math.min(progressPercent, 100);
    }
    
    return progressMap;
  } catch (error) {
    console.error('Error getting all topic progress:', error);
    return {};
  }
};

// Instance method to mark lesson as completed
userProgressSchema.methods.markCompleted = function() {
  this.completed = true;
  this.progressPercent = 100;
  this.completedAt = new Date();
  return this.save();
};

// Pre-save middleware to auto-calculate completion
userProgressSchema.pre('save', function(next) {
  // Auto-mark as completed if progress is 100%
  if (this.progressPercent >= 100 && !this.completed) {
    this.completed = true;
    this.completedAt = new Date();
  }
  
  // Ensure progressPercent is within bounds
  if (this.progressPercent < 0) this.progressPercent = 0;
  if (this.progressPercent > 100) this.progressPercent = 100;
  
  next();
});

module.exports = mongoose.model('UserProgress', userProgressSchema);