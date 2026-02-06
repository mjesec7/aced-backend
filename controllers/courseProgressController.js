// controllers/courseProgressController.js
const CourseProgress = require('../models/courseProgress');
const UpdatedCourse = require('../models/updatedCourse');

// Save or update course progress
exports.saveOrUpdateProgress = async (req, res) => {
  const {
    userId,
    courseId,
    completedLessons,
    currentLesson,
    totalTimeSpent,
    homeworkCompleted
  } = req.body;

  if (!userId || !courseId) {
    return res.status(400).json({
      success: false,
      message: 'userId and courseId are required.'
    });
  }

  try {
    // Get total lessons from the course if not already set
    const course = await UpdatedCourse.findById(courseId).select('lessons curriculum courseMetadata').lean();
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found.'
      });
    }

    const totalLessons = course.lessons?.length || course.curriculum?.length || course.courseMetadata?.totalLessons || 0;

    const updateData = {
      lastAccessedAt: new Date(),
      totalLessons
    };

    if (completedLessons !== undefined) updateData.completedLessons = completedLessons;
    if (currentLesson !== undefined) updateData.currentLesson = currentLesson;
    if (totalTimeSpent !== undefined) updateData.totalTimeSpent = totalTimeSpent;
    if (homeworkCompleted !== undefined) updateData.homeworkCompleted = homeworkCompleted;

    const progress = await CourseProgress.findOneAndUpdate(
      { userId, courseId },
      { $set: updateData, $setOnInsert: { startedAt: new Date() } },
      { upsert: true, new: true, runValidators: true }
    );

    // Update course enrollment count
    await UpdatedCourse.findByIdAndUpdate(courseId, {
      $max: { enrollmentCount: await CourseProgress.countDocuments({ courseId }) }
    });

    res.status(200).json({
      success: true,
      message: 'Course progress saved/updated',
      data: progress
    });
  } catch (error) {
    console.error('Error saving course progress:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Complete a lesson within a course
exports.completeLesson = async (req, res) => {
  const { userId, courseId, lessonNumber } = req.body;

  if (!userId || !courseId || lessonNumber === undefined) {
    return res.status(400).json({
      success: false,
      message: 'userId, courseId, and lessonNumber are required.'
    });
  }

  try {
    const course = await UpdatedCourse.findById(courseId).select('lessons curriculum courseMetadata').lean();
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found.'
      });
    }

    const totalLessons = course.lessons?.length || course.curriculum?.length || course.courseMetadata?.totalLessons || 0;

    // Find or create progress record
    let progress = await CourseProgress.findOne({ userId, courseId });

    if (!progress) {
      progress = new CourseProgress({
        userId,
        courseId,
        totalLessons,
        completedLessons: [],
        currentLesson: 1
      });
    }

    // Add lesson to completed if not already there
    if (!progress.completedLessons.includes(lessonNumber)) {
      progress.completedLessons.push(lessonNumber);
      progress.completedLessons.sort((a, b) => a - b);
    }

    // Update total lessons in case it changed
    progress.totalLessons = totalLessons;

    // Advance current lesson
    if (lessonNumber >= progress.currentLesson && lessonNumber < totalLessons) {
      progress.currentLesson = lessonNumber + 1;
    }

    await progress.save();

    res.status(200).json({
      success: true,
      message: 'Lesson completed',
      data: progress
    });
  } catch (error) {
    console.error('Error completing course lesson:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get all course progress for a user
exports.getUserCourseProgress = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'userId is required.'
    });
  }

  try {
    const progress = await CourseProgress.getUserCourseProgress(userId);

    res.status(200).json({
      success: true,
      message: 'User course progress retrieved',
      data: progress
    });
  } catch (error) {
    console.error('Error getting user course progress:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get progress for a specific course
exports.getCourseProgress = async (req, res) => {
  const { userId, courseId } = req.params;

  if (!userId || !courseId) {
    return res.status(400).json({
      success: false,
      message: 'userId and courseId are required.'
    });
  }

  try {
    const progress = await CourseProgress.findOne({ userId, courseId })
      .populate('courseId', 'title thumbnail category difficulty duration lessons curriculum')
      .lean();

    if (!progress) {
      return res.status(200).json({
        success: true,
        message: 'No progress found for this course',
        data: {
          userId,
          courseId,
          progressPercent: 0,
          completed: false,
          completedLessons: [],
          totalLessons: 0,
          currentLesson: 1
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Course progress retrieved',
      data: progress
    });
  } catch (error) {
    console.error('Error getting course progress:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get progress map for all courses (for enriching course cards)
exports.getUserProgressMap = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'userId is required.'
    });
  }

  try {
    const progressMap = await CourseProgress.getUserProgressMap(userId);

    res.status(200).json({
      success: true,
      message: 'Course progress map retrieved',
      data: progressMap
    });
  } catch (error) {
    console.error('Error getting course progress map:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get course analytics for a user
exports.getUserCourseAnalytics = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'userId is required.'
    });
  }

  try {
    const analytics = await CourseProgress.getUserCourseAnalytics(userId);

    res.status(200).json({
      success: true,
      message: 'Course analytics retrieved',
      data: analytics
    });
  } catch (error) {
    console.error('Error getting course analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Reset course progress
exports.resetCourseProgress = async (req, res) => {
  const { userId, courseId } = req.params;

  if (!userId || !courseId) {
    return res.status(400).json({
      success: false,
      message: 'userId and courseId are required.'
    });
  }

  // Verify user can only reset their own progress
  if (req.user?.uid !== userId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied: user mismatch'
    });
  }

  try {
    const result = await CourseProgress.findOneAndDelete({ userId, courseId });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'No progress found for this course'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Course progress reset successfully'
    });
  } catch (error) {
    console.error('Error resetting course progress:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
