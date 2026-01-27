const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  lessonId: {
    type: String,
    default: null
  },
  courseId: {
    type: String,
    required: [true, 'Course ID is required']
  },
  userId: {
    type: String,
    required: [true, 'User ID is required']
  },
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5']
  },
  feedback: {
    type: String,
    maxlength: [2000, 'Feedback cannot exceed 2000 characters'],
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
  timestamps: true
});

// Indexes
// Unique compound index - one rating per user per course
ratingSchema.index({ courseId: 1, userId: 1 }, { unique: true });
// Index for aggregation queries by course
ratingSchema.index({ courseId: 1 });
// Index for lesson queries
ratingSchema.index({ lessonId: 1 });

// Pre-save hook to update timestamps
ratingSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

// Static method to get rating stats for a course
ratingSchema.statics.getCourseRatingStats = async function(courseId) {
  const result = await this.aggregate([
    { $match: { courseId: courseId } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalRatings: { $sum: 1 },
        ratings: { $push: '$rating' }
      }
    }
  ]);

  // Calculate distribution
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (result[0]?.ratings) {
    result[0].ratings.forEach(r => {
      if (distribution.hasOwnProperty(r)) {
        distribution[r]++;
      }
    });
  }

  return {
    averageRating: result[0]?.averageRating ? Math.round(result[0].averageRating * 10) / 10 : 0,
    totalRatings: result[0]?.totalRatings || 0,
    distribution
  };
};

// Static method to get bulk rating stats for multiple courses
ratingSchema.statics.getBulkCourseRatingStats = async function(courseIds) {
  const result = await this.aggregate([
    { $match: { courseId: { $in: courseIds } } },
    {
      $group: {
        _id: '$courseId',
        averageRating: { $avg: '$rating' },
        totalRatings: { $sum: 1 }
      }
    }
  ]);

  // Convert to map
  const statsMap = {};
  courseIds.forEach(id => {
    statsMap[id] = { averageRating: 0, totalRatings: 0 };
  });

  result.forEach(item => {
    statsMap[item._id] = {
      averageRating: item.averageRating ? Math.round(item.averageRating * 10) / 10 : 0,
      totalRatings: item.totalRatings
    };
  });

  return statsMap;
};

module.exports = mongoose.model('Rating', ratingSchema);
