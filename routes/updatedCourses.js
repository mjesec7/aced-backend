// routes/updatedCourses.js - FIXED VERSION WITH PROPER IMAGE/TEXT SUPPORT
const express = require('express');
const router = express.Router();
const UpdatedCourse = require('../models/updatedCourse');
const authenticateUser = require('../middlewares/authMiddleware');

// ========================================
// 📚 PUBLIC ROUTES (for main frontend)
// ========================================

// GET /api/updated-courses - Get all updated courses (public, for main website)
router.get('/', async (req, res) => {
  try {
    console.log('📥 Fetching updated courses for main website...');
    
    const {
      category,
      difficulty,
      search,
      limit = 50,
      page = 1,
      sort = 'newest',
      type = 'all' // Filter by course or guide
    } = req.query;

    // Build filter
    const filter = { 
      isActive: true,
      status: 'published'
    };

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (difficulty && difficulty !== 'all') {
      filter.difficulty = difficulty;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tools: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Apply type filter
    if (type === 'courses') {
      filter.isGuide = { $ne: true };
    } else if (type === 'guides') {
      filter.isGuide = true;
    }

    // Build sort
    let sortQuery = {};
    switch (sort) {
      case 'popular':
        sortQuery = { studentsCount: -1 };
        break;
      case 'rating':
        sortQuery = { rating: -1 };
        break;
      case 'duration':
        sortQuery = { 'estimatedTime.hours': 1 };
        break;
      case 'newest':
      default:
        sortQuery = { createdAt: -1 };
    }

    // Execute query
    const courses = await UpdatedCourse.find(filter)
      .sort(sortQuery)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select('-seo -metadata.views -createdBy -updatedBy')
      .lean();

    // ✅ FIXED: Ensure proper course data structure for frontend
    const coursesWithBookmarks = courses.map(course => ({
      ...course,
      id: course._id.toString(), // ✅ Ensure 'id' field exists
      _id: course._id.toString(),
      isBookmarked: false, // Always false for non-tracked users
      // ✅ Ensure curriculum structure is correct
      curriculum: course.curriculum || [],
      // ✅ Ensure instructor has proper structure
      instructor: {
        name: course.instructor?.name || 'Unknown Instructor',
        avatar: course.instructor?.avatar || '/default-avatar.jpg',
        bio: course.instructor?.bio || ''
      }
    }));

    const total = await UpdatedCourse.countDocuments(filter);

    console.log(`✅ Found ${courses.length} updated courses for frontend`);

    res.json({
      success: true,
      courses: coursesWithBookmarks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      categories: await UpdatedCourse.getCategories(),
      difficulties: await UpdatedCourse.getDifficultyLevels()
    });

  } catch (error) {
    console.error('❌ Error fetching updated courses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch updated courses',
      details: error.message
    });
  }
});

// GET /api/updated-courses/categories - Get available categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await UpdatedCourse.getCategories();
    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => {
        const count = await UpdatedCourse.countDocuments({ 
          category, 
          isActive: true, 
          status: 'published' 
        });
        return { name: category, count };
      })
    );

    res.json({
      success: true,
      categories: categoriesWithCount
    });
  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories'
    });
  }
});

// ✅ FIXED: Get single course by ID with proper lesson structure
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const course = await UpdatedCourse.findOne({
      $or: [
        { _id: id },
        { 'seo.slug': id }
      ],
      isActive: true,
      status: 'published'
    }).select('-createdBy -updatedBy');

    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    // Increment views
    await course.incrementViews();

    // ✅ FIXED: Structure the response properly for frontend consumption
    const courseData = {
      ...course.toObject(),
      id: course._id.toString(),
      _id: course._id.toString(),
      isBookmarked: false,
      // ✅ Convert curriculum to lessons format for frontend compatibility
      lessons: course.curriculum.map((lesson, index) => ({
        id: lesson._id?.toString() || `lesson_${index}`,
        _id: lesson._id?.toString() || `lesson_${index}`,
        title: lesson.title,
        lessonName: lesson.title, // For backward compatibility
        description: lesson.description,
        duration: lesson.duration || '30 min',
        order: lesson.order || index,
        // ✅ Convert steps to proper format (images and text only)
        steps: (lesson.steps || []).map((step, stepIndex) => ({
          id: `step_${index}_${stepIndex}`,
          type: step.type,
          data: step.data,
          content: step.content,
          title: step.title,
          description: step.description,
          images: step.images || [],
          // Remove video-related fields
          videoUrl: undefined,
          guideVideoUrl: undefined
        }))
      }))
    };

    res.json({
      success: true,
      course: courseData
    });

  } catch (error) {
    console.error('❌ Error fetching course:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch course'
    });
  }
});

// ✅ FIXED: Get course lessons in proper format
router.get('/:id/lessons', async (req, res) => {
  try {
    const { id } = req.params;
    
    const course = await UpdatedCourse.findOne({
      $or: [
        { _id: id },
        { 'seo.slug': id }
      ],
      isActive: true,
      status: 'published'
    }).select('curriculum title');

    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    // ✅ Convert curriculum to lessons format
    const lessons = course.curriculum.map((lesson, index) => ({
      id: lesson._id?.toString() || `lesson_${index}`,
      _id: lesson._id?.toString() || `lesson_${index}`,
      title: lesson.title,
      lessonName: lesson.title,
      description: lesson.description,
      duration: lesson.duration || '30 min',
      order: lesson.order || index,
      topicId: course._id.toString(), // Link back to course
      subject: course.category || 'General',
      // ✅ Process steps to only include images and text
      steps: (lesson.steps || []).map((step, stepIndex) => {
        const processedStep = {
          id: `step_${index}_${stepIndex}`,
          type: step.type,
          data: {},
          content: step.content,
          title: step.title,
          description: step.description
        };

        // ✅ Only allow specific step types (no video)
        switch (step.type) {
          case 'explanation':
          case 'example':
          case 'reading':
            processedStep.data = {
              content: step.data?.content || step.content || '',
              images: step.data?.images || step.images || []
            };
            break;

          case 'image':
            processedStep.data = {
              images: step.data?.images || step.images || [],
              description: step.data?.description || step.description || ''
            };
            break;

          case 'practice':
            processedStep.data = {
              instructions: step.data?.instructions || step.instructions || '',
              type: step.data?.type || 'guided'
            };
            break;

          case 'quiz':
            processedStep.data = step.data?.quizzes || step.quizzes || [];
            break;

          default:
            processedStep.data = step.data || {};
        }

        return processedStep;
      })
    }));

    res.json({
      success: true,
      data: lessons,
      lessons: lessons, // For backward compatibility
      source: 'updated-course-curriculum'
    });

  } catch (error) {
    console.error('❌ Error fetching course lessons:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch course lessons'
    });
  }
});

// POST /api/updated-courses/:id/bookmark - Toggle bookmark (mock endpoint)
router.post('/:id/bookmark', (req, res) => {
  // Since we don't track individual users for updated courses,
  // this is just a mock endpoint that always returns success
  res.json({
    success: true,
    bookmarked: true,
    message: 'Bookmark status updated'
  });
});

// DELETE /api/updated-courses/:id/bookmark - Remove bookmark (mock endpoint)
router.delete('/:id/bookmark', (req, res) => {
  res.json({
    success: true,
    bookmarked: false,
    message: 'Bookmark removed'
  });
});

// ========================================
// 🛡️ ADMIN ROUTES (require authentication)
// ========================================

// GET /api/updated-courses/admin/all - Get all courses for admin (with full data)
router.get('/admin/all', authenticateUser, async (req, res) => {
  try {
    console.log('📥 Admin: Fetching all updated courses...');
    
    const {
      category,
      difficulty,
      status,
      search,
      limit = 20,
      page = 1,
      sort = 'newest',
      type = 'all'
    } = req.query;

    // Build filter
    const filter = {};

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (difficulty && difficulty !== 'all') {
      filter.difficulty = difficulty;
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'instructor.name': { $regex: search, $options: 'i' } },
        { tools: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Apply type filter
    if (type === 'courses') {
      filter.isGuide = { $ne: true };
    } else if (type === 'guides') {
      filter.isGuide = true;
    }

    // Build sort
    let sortQuery = {};
    switch (sort) {
      case 'popular':
        sortQuery = { studentsCount: -1 };
        break;
      case 'rating':
        sortQuery = { rating: -1 };
        break;
      case 'title':
        sortQuery = { title: 1 };
        break;
      case 'updated':
        sortQuery = { updatedAt: -1 };
        break;
      case 'newest':
      default:
        sortQuery = { createdAt: -1 };
    }

    // Execute query
    const courses = await UpdatedCourse.find(filter)
      .sort(sortQuery)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await UpdatedCourse.countDocuments(filter);

    console.log(`✅ Admin: Found ${courses.length} updated courses`);

    res.json({
      success: true,
      courses: courses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      stats: {
        total: await UpdatedCourse.countDocuments(),
        published: await UpdatedCourse.countDocuments({ status: 'published' }),
        draft: await UpdatedCourse.countDocuments({ status: 'draft' }),
        archived: await UpdatedCourse.countDocuments({ status: 'archived' }),
        premium: await UpdatedCourse.countDocuments({ isPremium: true }),
        free: await UpdatedCourse.countDocuments({ isPremium: false })
      }
    });

  } catch (error) {
    console.error('❌ Admin: Error fetching updated courses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch updated courses',
      details: error.message
    });
  }
});

// POST /api/updated-courses/admin - Create new course
router.post('/admin', authenticateUser, async (req, res) => {
  try {
    console.log('📤 Admin: Creating new updated course...');
    
    const courseData = {
      ...req.body,
      createdBy: req.user.uid || req.user.email || 'admin',
      updatedBy: req.user.uid || req.user.email || 'admin'
    };

    // Validate required fields
    const requiredFields = ['title', 'description', 'category', 'instructor'];
    const missingFields = requiredFields.filter(field => {
      if (field === 'instructor') {
        return !courseData.instructor || !courseData.instructor.name;
      }
      return !courseData[field];
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        missingFields
      });
    }

    // ✅ FIXED: Process curriculum to remove video elements
    if (courseData.curriculum && Array.isArray(courseData.curriculum)) {
      courseData.curriculum = courseData.curriculum.map(lesson => ({
        ...lesson,
        steps: (lesson.steps || []).map(step => {
          const processedStep = { ...step };
          
          // Remove video-related fields
          delete processedStep.videoUrl;
          delete processedStep.guideVideoUrl;
          
          // Only allow specific step types
          if (!['explanation', 'example', 'reading', 'image', 'practice', 'quiz'].includes(step.type)) {
            processedStep.type = 'explanation';
          }
          
          return processedStep;
        })
      }));
    }

    const course = new UpdatedCourse(courseData);
    await course.save();

    console.log('✅ Admin: Updated course created:', course.title);

    res.status(201).json({
      success: true,
      course: course,
      message: 'Course created successfully'
    });

  } catch (error) {
    console.error('❌ Admin: Error creating updated course:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: Object.values(error.errors).map(err => err.message)
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Duplicate course slug. Please choose a different title.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create course',
      details: error.message
    });
  }
});

// PUT /api/updated-courses/admin/:id - Update course
router.put('/admin/:id', authenticateUser, async (req, res) => {
  try {
    console.log('📝 Admin: Updating updated course:', req.params.id);
    
    const updateData = {
      ...req.body,
      updatedBy: req.user.uid || req.user.email || 'admin'
    };

    // ✅ FIXED: Process curriculum to remove video elements on update
    if (updateData.curriculum && Array.isArray(updateData.curriculum)) {
      updateData.curriculum = updateData.curriculum.map(lesson => ({
        ...lesson,
        steps: (lesson.steps || []).map(step => {
          const processedStep = { ...step };
          
          // Remove video-related fields
          delete processedStep.videoUrl;
          delete processedStep.guideVideoUrl;
          
          // Only allow specific step types
          if (!['explanation', 'example', 'reading', 'image', 'practice', 'quiz'].includes(step.type)) {
            processedStep.type = 'explanation';
          }
          
          return processedStep;
        })
      }));
    }

    const course = await UpdatedCourse.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    console.log('✅ Admin: Updated course updated:', course.title);

    res.json({
      success: true,
      course: course,
      message: 'Course updated successfully'
    });

  } catch (error) {
    console.error('❌ Admin: Error updating updated course:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update course',
      details: error.message
    });
  }
});

// DELETE /api/updated-courses/admin/:id - Delete course
router.delete('/admin/:id', authenticateUser, async (req, res) => {
  try {
    console.log('🗑️ Admin: Deleting updated course:', req.params.id);
    
    const course = await UpdatedCourse.findByIdAndDelete(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    console.log('✅ Admin: Updated course deleted:', course.title);

    res.json({
      success: true,
      message: 'Course deleted successfully'
    });

  } catch (error) {
    console.error('❌ Admin: Error deleting updated course:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete course',
      details: error.message
    });
  }
});

// PATCH /api/updated-courses/admin/:id/status - Update course status
router.patch('/admin/:id/status', authenticateUser, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['draft', 'published', 'archived'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be: draft, published, or archived'
      });
    }

    const course = await UpdatedCourse.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        updatedBy: req.user.uid || req.user.email || 'admin'
      },
      { new: true }
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    res.json({
      success: true,
      course: course,
      message: `Course status updated to ${status}`
    });

  } catch (error) {
    console.error('❌ Admin: Error updating course status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update course status'
    });
  }
});

// PATCH /api/updated-courses/admin/:id/toggle-premium - Toggle premium status
router.patch('/admin/:id/toggle-premium', authenticateUser, async (req, res) => {
  try {
    const course = await UpdatedCourse.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    await course.togglePremium();
    course.updatedBy = req.user.uid || req.user.email || 'admin';
    await course.save();

    res.json({
      success: true,
      course: course,
      message: `Course is now ${course.isPremium ? 'premium' : 'free'}`
    });

  } catch (error) {
    console.error('❌ Admin: Error toggling premium status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle premium status'
    });
  }
});

// GET /api/updated-courses/admin/stats - Get detailed statistics
router.get('/admin/stats', authenticateUser, async (req, res) => {
  try {
    const stats = {
      overview: {
        total: await UpdatedCourse.countDocuments(),
        published: await UpdatedCourse.countDocuments({ status: 'published' }),
        draft: await UpdatedCourse.countDocuments({ status: 'draft' }),
        archived: await UpdatedCourse.countDocuments({ status: 'archived' })
      },
      byCategory: {},
      byDifficulty: {},
      byInstructor: {},
      premium: {
        total: await UpdatedCourse.countDocuments({ isPremium: true }),
        free: await UpdatedCourse.countDocuments({ isPremium: false })
      },
      engagement: {
        totalViews: await UpdatedCourse.aggregate([
          { $group: { _id: null, total: { $sum: '$metadata.views' } } }
        ]),
        averageRating: await UpdatedCourse.aggregate([
          { $group: { _id: null, avg: { $avg: '$rating' } } }
        ]),
        totalStudents: await UpdatedCourse.aggregate([
          { $group: { _id: null, total: { $sum: '$studentsCount' } } }
        ])
      }
    };

    // Category breakdown
    const categories = await UpdatedCourse.getCategories();
    for (const category of categories) {
      stats.byCategory[category] = await UpdatedCourse.countDocuments({ 
        category, 
        status: 'published' 
      });
    }

    // Difficulty breakdown
    const difficulties = await UpdatedCourse.getDifficultyLevels();
    for (const difficulty of difficulties) {
      stats.byDifficulty[difficulty] = await UpdatedCourse.countDocuments({ 
        difficulty, 
        status: 'published' 
      });
    }

    // Top instructors
    const topInstructors = await UpdatedCourse.aggregate([
      { $match: { status: 'published' } },
      { $group: { 
          _id: '$instructor.name', 
          count: { $sum: 1 },
          totalStudents: { $sum: '$studentsCount' },
          averageRating: { $avg: '$rating' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    stats.byInstructor = topInstructors;

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ Admin: Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// POST /api/updated-courses/admin/bulk-import - Bulk import courses
router.post('/admin/bulk-import', authenticateUser, async (req, res) => {
  try {
    const { courses } = req.body;
    
    if (!Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No courses provided for import'
      });
    }

    const createdBy = req.user.uid || req.user.email || 'admin';
    const coursesWithMeta = courses.map(course => {
      // ✅ FIXED: Process curriculum to remove video elements during bulk import
      const processedCourse = {
        ...course,
        createdBy,
        updatedBy: createdBy
      };

      if (processedCourse.curriculum && Array.isArray(processedCourse.curriculum)) {
        processedCourse.curriculum = processedCourse.curriculum.map(lesson => ({
          ...lesson,
          steps: (lesson.steps || []).map(step => {
            const processedStep = { ...step };
            
            // Remove video-related fields
            delete processedStep.videoUrl;
            delete processedStep.guideVideoUrl;
            
            // Only allow specific step types
            if (!['explanation', 'example', 'reading', 'image', 'practice', 'quiz'].includes(step.type)) {
              processedStep.type = 'explanation';
            }
            
            return processedStep;
          })
        }));
      }

      return processedCourse;
    });

    const result = await UpdatedCourse.insertMany(coursesWithMeta, { 
      ordered: false // Continue on errors
    });

    res.json({
      success: true,
      imported: result.length,
      message: `Successfully imported ${result.length} courses`
    });

  } catch (error) {
    console.error('❌ Admin: Error bulk importing courses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import courses',
      details: error.message
    });
  }
});

module.exports = router;