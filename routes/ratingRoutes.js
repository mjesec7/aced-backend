const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Rating = require('../models/Rating');
const User = require('../models/user');
const verifyToken = require('../middlewares/authMiddleware');

// Helper function to format user name for reviews (First name + last initial)
function formatUserName(fullName) {
  if (!fullName) return 'Anonymous';
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

// Helper function to validate ObjectId
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * GET /api/ratings/lesson
 * This endpoint only accepts POST requests - GET is not supported
 */
router.get('/lesson', (req, res) => {
  res.status(405).json({
    success: false,
    error: 'Method not allowed. Use POST to submit lesson ratings',
    hint: 'This endpoint only accepts POST requests with lessonId, courseId, rating, and optional feedback'
  });
});

/**
 * POST /api/ratings/lesson
 * Submit a lesson rating (creates or updates)
 */
router.post('/lesson', verifyToken, async (req, res) => {
  try {
    const { lessonId, courseId, rating, feedback } = req.body;
    const userId = req.firebaseId;

    // Validation
    if (!courseId) {
      return res.status(400).json({
        success: false,
        error: 'Course ID is required'
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be between 1 and 5'
      });
    }

    // Upsert rating (one rating per user per course)
    const existingRating = await Rating.findOneAndUpdate(
      { courseId, userId },
      {
        lessonId: lessonId || null,
        courseId,
        userId,
        rating,
        feedback: feedback || null,
        updatedAt: new Date()
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({
      success: true,
      data: existingRating
    });
  } catch (error) {
    console.error('❌ Error submitting lesson rating:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit rating',
      details: error.message
    });
  }
});

/**
 * POST /api/ratings/course
 * Submit a course rating (creates or updates)
 */
router.post('/course', verifyToken, async (req, res) => {
  try {
    const { courseId, rating, feedback } = req.body;
    const userId = req.firebaseId;

    // Validation
    if (!courseId) {
      return res.status(400).json({
        success: false,
        error: 'Course ID is required'
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be between 1 and 5'
      });
    }

    // Upsert rating (one rating per user per course)
    const existingRating = await Rating.findOneAndUpdate(
      { courseId, userId },
      {
        courseId,
        userId,
        rating,
        feedback: feedback || null,
        updatedAt: new Date()
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({
      success: true,
      data: existingRating
    });
  } catch (error) {
    console.error('❌ Error submitting course rating:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit rating',
      details: error.message
    });
  }
});

/**
 * GET /api/ratings/course/:courseId
 * Get course rating stats (average, total, distribution)
 */
router.get('/course/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        error: 'Course ID is required'
      });
    }

    const stats = await Rating.getCourseRatingStats(courseId);

    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('❌ Error fetching course rating stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rating stats',
      details: error.message
    });
  }
});

/**
 * POST /api/ratings/courses/bulk
 * Get ratings for multiple courses at once
 */
router.post('/courses/bulk', async (req, res) => {
  try {
    const { courseIds } = req.body;

    if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'courseIds array is required'
      });
    }

    // Limit to prevent abuse
    if (courseIds.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 course IDs allowed per request'
      });
    }

    const statsMap = await Rating.getBulkCourseRatingStats(courseIds);

    res.json({
      success: true,
      data: statsMap
    });
  } catch (error) {
    console.error('❌ Error fetching bulk course ratings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bulk ratings',
      details: error.message
    });
  }
});

/**
 * GET /api/ratings/course/:courseId/user
 * Get user's rating for a specific course
 */
router.get('/course/:courseId/user', verifyToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.firebaseId;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        error: 'Course ID is required'
      });
    }

    const rating = await Rating.findOne({ courseId, userId });

    res.json({
      success: true,
      data: rating
    });
  } catch (error) {
    console.error('❌ Error fetching user rating:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user rating',
      details: error.message
    });
  }
});

/**
 * PUT /api/ratings/:ratingId
 * Update a rating
 */
router.put('/:ratingId', verifyToken, async (req, res) => {
  try {
    const { ratingId } = req.params;
    const { rating, feedback } = req.body;
    const userId = req.firebaseId;

    if (!isValidObjectId(ratingId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid rating ID format'
      });
    }

    // Find the rating
    const existingRating = await Rating.findById(ratingId);

    if (!existingRating) {
      return res.status(404).json({
        success: false,
        error: 'Rating not found'
      });
    }

    // Check ownership
    if (existingRating.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own ratings'
      });
    }

    // Validate rating if provided
    if (rating !== undefined && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be between 1 and 5'
      });
    }

    // Update fields
    if (rating !== undefined) existingRating.rating = rating;
    if (feedback !== undefined) existingRating.feedback = feedback;
    existingRating.updatedAt = new Date();

    await existingRating.save();

    res.json({
      success: true,
      data: existingRating
    });
  } catch (error) {
    console.error('❌ Error updating rating:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update rating',
      details: error.message
    });
  }
});

/**
 * DELETE /api/ratings/:ratingId
 * Delete a rating
 */
router.delete('/:ratingId', verifyToken, async (req, res) => {
  try {
    const { ratingId } = req.params;
    const userId = req.firebaseId;

    if (!isValidObjectId(ratingId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid rating ID format'
      });
    }

    // Find the rating
    const existingRating = await Rating.findById(ratingId);

    if (!existingRating) {
      return res.status(404).json({
        success: false,
        error: 'Rating not found'
      });
    }

    // Check ownership
    if (existingRating.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own ratings'
      });
    }

    await Rating.findByIdAndDelete(ratingId);

    res.json({
      success: true,
      message: 'Rating deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting rating:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete rating',
      details: error.message
    });
  }
});

/**
 * GET /api/ratings/course/:courseId/reviews
 * Get paginated reviews for a course
 */
router.get('/course/:courseId/reviews', async (req, res) => {
  try {
    const { courseId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Max 50 per page
    const skip = (page - 1) * limit;

    if (!courseId) {
      return res.status(400).json({
        success: false,
        error: 'Course ID is required'
      });
    }

    // Get total count
    const total = await Rating.countDocuments({
      courseId,
      feedback: { $ne: null, $ne: '' }
    });

    // Get paginated reviews (only those with feedback)
    const ratings = await Rating.find({
      courseId,
      feedback: { $ne: null, $ne: '' }
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get user info for reviews
    const userIds = ratings.map(r => r.userId);
    const users = await User.find(
      { firebaseId: { $in: userIds } },
      { firebaseId: 1, name: 1, photoURL: 1 }
    ).lean();

    // Create user map for quick lookup
    const userMap = {};
    users.forEach(u => {
      userMap[u.firebaseId] = u;
    });

    // Format reviews with user info
    const reviews = ratings.map(r => {
      const user = userMap[r.userId] || {};
      return {
        _id: r._id,
        userId: r.userId,
        userName: formatUserName(user.name),
        userAvatar: user.photoURL || null,
        rating: r.rating,
        feedback: r.feedback,
        createdAt: r.createdAt
      };
    });

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      reviews,
      total,
      page,
      totalPages
    });
  } catch (error) {
    console.error('❌ Error fetching course reviews:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reviews',
      details: error.message
    });
  }
});

module.exports = router;
