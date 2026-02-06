// models/courseProgress.js
const mongoose = require('mongoose');

const courseProgressSchema = new mongoose.Schema({
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

  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UpdatedCourse',
    required: [true, 'Course ID is required'],
    validate: {
      validator: function(v) {
        return mongoose.Types.ObjectId.isValid(v);
      },
      message: 'Invalid course ID format'
    }
  },

  // Lesson-level tracking
  completedLessons: {
    type: [Number], // lesson numbers that have been completed
    default: []
  },

  totalLessons: {
    type: Number,
    default: 0,
    min: [0, 'Total lessons cannot be negative']
  },

  currentLesson: {
    type: Number,
    default: 1,
    min: [1, 'Current lesson must be at least 1']
  },

  progressPercent: {
    type: Number,
    default: 0,
    min: [0, 'Progress cannot be negative'],
    max: [100, 'Progress cannot exceed 100%']
  },

  completed: {
    type: Boolean,
    default: false
  },

  // Timestamps
  startedAt: {
    type: Date,
    default: Date.now
  },

  completedAt: {
    type: Date
  },

  lastAccessedAt: {
    type: Date,
    default: Date.now
  },

  // Time tracking
  totalTimeSpent: {
    type: Number, // seconds
    default: 0,
    min: 0
  },

  // Homework tracking per lesson
  homeworkCompleted: {
    type: [Number], // lesson numbers where homework was completed
    default: []
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Unique constraint: one progress record per user per course
courseProgressSchema.index({ userId: 1, courseId: 1 }, {
  unique: true,
  name: 'unique_user_course_progress'
});

// Performance indexes
courseProgressSchema.index({ userId: 1, completed: 1 }, { name: 'user_course_completion' });
courseProgressSchema.index({ courseId: 1, completed: 1 }, { name: 'course_completion_stats' });
courseProgressSchema.index({ userId: 1, lastAccessedAt: -1 }, { name: 'user_recent_courses' });

// Virtual: completion percentage based on lessons
courseProgressSchema.virtual('lessonCompletionPercent').get(function() {
  if (this.totalLessons === 0) return 0;
  return Math.round((this.completedLessons.length / this.totalLessons) * 100);
});

// Pre-save: auto-calculate progress and completion
courseProgressSchema.pre('save', function(next) {
  try {
    // Recalculate progress percent from completed lessons
    if (this.totalLessons > 0) {
      this.progressPercent = Math.round((this.completedLessons.length / this.totalLessons) * 100);
      this.progressPercent = Math.max(0, Math.min(100, this.progressPercent));
    }

    // Auto-mark as completed if all lessons done
    if (this.progressPercent >= 100 && !this.completed) {
      this.completed = true;
      this.completedAt = new Date();
    }

    // Update last accessed
    this.lastAccessedAt = new Date();

    next();
  } catch (error) {
    next(error);
  }
});

// Static: get all course progress for a user
courseProgressSchema.statics.getUserCourseProgress = async function(userId) {
  try {
    if (!userId) throw new Error('userId is required');

    const progress = await this.find({ userId: userId.toString() })
      .populate('courseId', 'title thumbnail category difficulty duration')
      .sort({ lastAccessedAt: -1 })
      .lean();

    return progress;
  } catch (error) {
    console.error('Error getting user course progress:', error.message);
    return [];
  }
};

// Static: get progress map for multiple courses (for enriching course cards)
courseProgressSchema.statics.getUserProgressMap = async function(userId) {
  try {
    if (!userId) return {};

    const progressRecords = await this.find({ userId: userId.toString() }).lean();

    const progressMap = {};
    progressRecords.forEach(record => {
      progressMap[record.courseId.toString()] = {
        progressPercent: record.progressPercent,
        completed: record.completed,
        completedLessons: record.completedLessons,
        totalLessons: record.totalLessons,
        currentLesson: record.currentLesson,
        lastAccessedAt: record.lastAccessedAt,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
        totalTimeSpent: record.totalTimeSpent,
        homeworkCompleted: record.homeworkCompleted
      };
    });

    return progressMap;
  } catch (error) {
    console.error('Error getting user progress map:', error.message);
    return {};
  }
};

// Static: get course stats (how many users completed, average progress, etc.)
courseProgressSchema.statics.getCourseStats = async function(courseId) {
  try {
    if (!courseId) throw new Error('courseId is required');

    const stats = await this.aggregate([
      { $match: { courseId: new mongoose.Types.ObjectId(courseId) } },
      {
        $group: {
          _id: null,
          totalEnrolled: { $sum: 1 },
          totalCompleted: { $sum: { $cond: ['$completed', 1, 0] } },
          averageProgress: { $avg: '$progressPercent' },
          averageTimeSpent: { $avg: '$totalTimeSpent' }
        }
      }
    ]);

    return stats[0] || {
      totalEnrolled: 0,
      totalCompleted: 0,
      averageProgress: 0,
      averageTimeSpent: 0
    };
  } catch (error) {
    console.error('Error getting course stats:', error.message);
    return { totalEnrolled: 0, totalCompleted: 0, averageProgress: 0, averageTimeSpent: 0 };
  }
};

// Static: get user's course analytics summary
courseProgressSchema.statics.getUserCourseAnalytics = async function(userId) {
  try {
    if (!userId) throw new Error('userId is required');

    const stats = await this.aggregate([
      { $match: { userId: userId.toString() } },
      {
        $group: {
          _id: null,
          totalCoursesStarted: { $sum: 1 },
          totalCoursesCompleted: { $sum: { $cond: ['$completed', 1, 0] } },
          averageProgress: { $avg: '$progressPercent' },
          totalTimeSpent: { $sum: '$totalTimeSpent' },
          totalLessonsCompleted: { $sum: { $size: '$completedLessons' } },
          totalHomeworkCompleted: { $sum: { $size: '$homeworkCompleted' } }
        }
      }
    ]);

    const result = stats[0] || {
      totalCoursesStarted: 0,
      totalCoursesCompleted: 0,
      averageProgress: 0,
      totalTimeSpent: 0,
      totalLessonsCompleted: 0,
      totalHomeworkCompleted: 0
    };

    delete result._id;

    // Get in-progress courses
    const inProgressCourses = await this.find({
      userId: userId.toString(),
      completed: false,
      progressPercent: { $gt: 0 }
    })
      .populate('courseId', 'title thumbnail category difficulty')
      .sort({ lastAccessedAt: -1 })
      .limit(5)
      .lean();

    // Get recently completed courses
    const recentlyCompleted = await this.find({
      userId: userId.toString(),
      completed: true
    })
      .populate('courseId', 'title thumbnail category difficulty')
      .sort({ completedAt: -1 })
      .limit(5)
      .lean();

    result.inProgressCourses = inProgressCourses;
    result.recentlyCompleted = recentlyCompleted;

    return result;
  } catch (error) {
    console.error('Error getting user course analytics:', error.message);
    return {
      totalCoursesStarted: 0,
      totalCoursesCompleted: 0,
      averageProgress: 0,
      totalTimeSpent: 0,
      totalLessonsCompleted: 0,
      totalHomeworkCompleted: 0,
      inProgressCourses: [],
      recentlyCompleted: []
    };
  }
};

module.exports = mongoose.model('CourseProgress', courseProgressSchema);
