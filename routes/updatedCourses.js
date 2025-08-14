// routes/updatedCourses.js - COMPLETE FIXED VERSION WITH PROPER CONTENT HANDLING
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
      type = 'all'
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

    // ✅ Ensure proper course data structure for frontend
    const coursesWithBookmarks = courses.map(course => ({
      ...course,
      id: course._id.toString(),
      _id: course._id.toString(),
      isBookmarked: false,
      curriculum: course.curriculum || [],
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

// ✅ Get single course by ID with proper lesson structure
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

    // ✅ Structure the response properly for frontend consumption
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
        lessonName: lesson.title,
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
          images: step.images || []
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

// ✅ Get course lessons in proper format
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
      topicId: course._id.toString(),
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
      lessons: lessons,
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

// ✅ CRITICAL FIX: Enhanced POST route for creating courses
router.post('/admin', authenticateUser, async (req, res) => {
  try {
    console.log('📤 Admin: Creating new updated course...');
    console.log('📦 Received course data:', {
      title: req.body.title,
      category: req.body.category,
      curriculumCount: req.body.curriculum?.length || 0,
      bodySize: JSON.stringify(req.body).length
    });
    
    const courseData = {
      ...req.body,
      createdBy: req.user.uid || req.user.email || 'admin',
      updatedBy: req.user.uid || req.user.email || 'admin'
    };

    // ✅ Enhanced validation of required fields
    const requiredFields = ['title', 'description', 'category', 'instructor'];
    const missingFields = requiredFields.filter(field => {
      if (field === 'instructor') {
        return !courseData.instructor || !courseData.instructor.name;
      }
      return !courseData[field];
    });

    if (missingFields.length > 0) {
      console.error('❌ Missing required fields:', missingFields);
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        missingFields
      });
    }

    // ✅ CRITICAL FIX: Enhanced curriculum processing with proper content handling
    if (courseData.curriculum && Array.isArray(courseData.curriculum)) {
      console.log('🔍 Processing curriculum with', courseData.curriculum.length, 'lessons');
      
      const contentIssues = [];
      
      courseData.curriculum = courseData.curriculum.map((lesson, lessonIndex) => {
        console.log(`🔍 Processing lesson ${lessonIndex + 1}:`, lesson.title);
        
        // Validate lesson title
        if (!lesson.title || !lesson.title.trim()) {
          contentIssues.push(`Lesson ${lessonIndex + 1}: Title is required`);
        }
        
        const processedLesson = {
          title: lesson.title || `Lesson ${lessonIndex + 1}`,
          description: lesson.description || '',
          duration: lesson.duration || '30 min',
          order: lesson.order || lessonIndex
        };

        // ✅ CRITICAL: Process steps with enhanced validation and structure
        if (lesson.steps && Array.isArray(lesson.steps)) {
          processedLesson.steps = lesson.steps.map((step, stepIndex) => {
            console.log(`🔍 Processing step ${stepIndex + 1} of type:`, step.type, 'content length:', step.content?.length || 0);
            
            const processedStep = {
              type: step.type || 'explanation',
              title: step.title || '',
              content: step.content || '',
              description: step.description || '',
              images: (step.images || []).filter(img => img && img.url),
              data: {}
            };

            // ✅ CRITICAL: Structure data field correctly based on step type
            switch (step.type) {
              case 'explanation':
              case 'example':
              case 'reading':
                // ✅ CRITICAL: Ensure explanation content is properly structured
                const explanationContent = step.content || step.data?.content || '';
                
                if (!explanationContent.trim()) {
                  contentIssues.push(`Lesson ${lessonIndex + 1}, Step ${stepIndex + 1}: ${step.type} content is required`);
                  console.warn(`⚠️ Warning: ${step.type} step in lesson ${lessonIndex + 1} has no content`);
                }
                
                processedStep.data = {
                  content: explanationContent,
                  images: processedStep.images || []
                };
                
                console.log(`✅ ${step.type} step processed with content length:`, explanationContent.length);
                break;

              case 'image':
                processedStep.data = {
                  images: processedStep.images || [],
                  description: step.content || step.description || '',
                  caption: step.caption || ''
                };
                break;

              case 'practice':
                const practiceInstructions = step.content || step.data?.instructions || step.instructions || '';
                
                if (!practiceInstructions.trim()) {
                  contentIssues.push(`Lesson ${lessonIndex + 1}, Step ${stepIndex + 1}: Practice instructions are required`);
                }
                
                processedStep.data = {
                  instructions: practiceInstructions,
                  type: step.data?.type || step.practiceType || 'guided'
                };
                
                // Also set at root level for compatibility
                processedStep.instructions = practiceInstructions;
                break;

              case 'quiz':
                // ✅ Handle quiz data structure
                let quizData = [];
                
                if (step.data && Array.isArray(step.data) && step.data.length > 0) {
                  // Already structured quiz data
                  quizData = step.data;
                } else if (step.question || step.content) {
                  // Convert from simple question format
                  const quizQuestion = step.question || step.content || '';
                  if (!quizQuestion.trim()) {
                    contentIssues.push(`Lesson ${lessonIndex + 1}, Step ${stepIndex + 1}: Quiz question is required`);
                  }
                  
                  quizData = [{
                    question: quizQuestion,
                    type: step.quizType || 'multiple-choice',
                    options: (step.options || []).map(opt => ({ text: opt.text || opt })),
                    correctAnswer: parseInt(step.correctAnswer) || 0,
                    explanation: step.explanation || ''
                  }];
                } else if (step.quizzes && Array.isArray(step.quizzes)) {
                  // Use existing quizzes array
                  quizData = step.quizzes;
                }
                
                processedStep.data = quizData;
                processedStep.quizzes = quizData;
                
                // Keep root-level quiz fields for compatibility
                if (quizData.length > 0) {
                  processedStep.question = quizData[0].question;
                  processedStep.options = quizData[0].options || [];
                  processedStep.correctAnswer = quizData[0].correctAnswer || 0;
                }
                break;

              default:
                // ✅ For unknown types, preserve content in data
                processedStep.data = {
                  content: step.content || '',
                  images: processedStep.images || []
                };
                console.log(`⚠️ Unknown step type: ${step.type}, using default structure`);
            }

            console.log(`✅ Processed step ${stepIndex + 1}:`, {
              type: processedStep.type,
              hasContent: !!processedStep.content,
              hasDataContent: !!(processedStep.data && (
                processedStep.data.content || 
                processedStep.data.instructions || 
                processedStep.data.length > 0
              )),
              dataKeys: Object.keys(processedStep.data || {})
            });

            return processedStep;
          });
        } else {
          processedLesson.steps = [];
        }

        return processedLesson;
      });

      // ✅ Check for content issues
      if (contentIssues.length > 0) {
        console.error('❌ Content validation failed:', contentIssues);
        return res.status(400).json({
          success: false,
          error: 'Course content validation failed',
          details: contentIssues
        });
      }

      // ✅ Log final curriculum structure
      const curriculumStats = {
        totalLessons: courseData.curriculum.length,
        totalSteps: courseData.curriculum.reduce((sum, lesson) => sum + (lesson.steps?.length || 0), 0),
        explanationSteps: courseData.curriculum.reduce((sum, lesson) => 
          sum + (lesson.steps?.filter(step => step.type === 'explanation').length || 0), 0
        ),
        stepsWithContent: courseData.curriculum.reduce((sum, lesson) => 
          sum + (lesson.steps?.filter(step => 
            step.content || (step.data && step.data.content)
          ).length || 0), 0
        )
      };
      
      console.log('📊 Final curriculum stats:', curriculumStats);
    } else {
      console.log('⚠️ No curriculum provided or curriculum is not an array');
      courseData.curriculum = [];
    }

    // ✅ Create the course with processed data
    const course = new UpdatedCourse(courseData);
    await course.save();

    console.log('✅ Admin: Updated course created:', course.title);
    console.log('📊 Course saved with curriculum stats:', {
      lessonsCount: course.curriculum?.length || 0,
      totalSteps: course.curriculum?.reduce((sum, lesson) => sum + (lesson.steps?.length || 0), 0) || 0
    });

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

// ✅ ENHANCED PUT route for updating courses
router.put('/admin/:id', authenticateUser, async (req, res) => {
  try {
    console.log('📝 Admin: Updating updated course:', req.params.id);
    console.log('📦 Update data received:', {
      title: req.body.title,
      curriculumCount: req.body.curriculum?.length || 0
    });
    
    const updateData = {
      ...req.body,
      updatedBy: req.user.uid || req.user.email || 'admin'
    };

    // ✅ ENHANCED: Process curriculum to handle content properly on update
    if (updateData.curriculum && Array.isArray(updateData.curriculum)) {
      console.log('🔍 Processing curriculum update with', updateData.curriculum.length, 'lessons');
      
      const contentIssues = [];
      
      updateData.curriculum = updateData.curriculum.map((lesson, lessonIndex) => {
        console.log(`🔍 Updating lesson ${lessonIndex + 1}:`, lesson.title);
        
        const processedLesson = {
          title: lesson.title || `Lesson ${lessonIndex + 1}`,
          description: lesson.description || '',
          duration: lesson.duration || '30 min',
          order: lesson.order || lessonIndex
        };

        // ✅ Process steps for updates
        if (lesson.steps && Array.isArray(lesson.steps)) {
          processedLesson.steps = lesson.steps.map((step, stepIndex) => {
            console.log(`🔍 Updating step ${stepIndex + 1} of type:`, step.type);
            
            const processedStep = {
              type: step.type || 'explanation',
              title: step.title || '',
              content: step.content || '',
              description: step.description || '',
              images: (step.images || []).filter(img => img && img.url),
              data: {}
            };

            // ✅ Structure data field for updates
            switch (step.type) {
              case 'explanation':
              case 'example':
              case 'reading':
                const explanationContent = step.content || step.data?.content || '';
                
                processedStep.data = {
                  content: explanationContent,
                  images: processedStep.images || []
                };
                
                console.log(`✅ Updated ${step.type} step with content length:`, explanationContent.length);
                break;

              case 'image':
                processedStep.data = {
                  images: processedStep.images || [],
                  description: step.content || step.description || ''
                };
                break;

              case 'practice':
                const practiceInstructions = step.content || step.data?.instructions || step.instructions || '';
                
                processedStep.data = {
                  instructions: practiceInstructions,
                  type: step.data?.type || step.practiceType || 'guided'
                };
                
                processedStep.instructions = practiceInstructions;
                break;

              case 'quiz':
                let quizData = [];
                
                if (step.data && Array.isArray(step.data)) {
                  quizData = step.data;
                } else if (step.question || step.content) {
                  quizData = [{
                    question: step.question || step.content || '',
                    type: step.quizType || 'multiple-choice',
                    options: (step.options || []).map(opt => ({ text: opt.text || opt })),
                    correctAnswer: parseInt(step.correctAnswer) || 0,
                    explanation: step.explanation || ''
                  }];
                }
                
                processedStep.data = quizData;
                processedStep.quizzes = quizData;
                
                if (quizData.length > 0) {
                  processedStep.question = quizData[0].question;
                  processedStep.options = quizData[0].options || [];
                  processedStep.correctAnswer = quizData[0].correctAnswer || 0;
                }
                break;

              default:
                processedStep.data = {
                  content: step.content || '',
                  images: processedStep.images || []
                };
            }

            return processedStep;
          });
        } else {
          processedLesson.steps = [];
        }

        return processedLesson;
      });

      console.log('📊 Updated curriculum stats:', {
        totalLessons: updateData.curriculum.length,
        totalSteps: updateData.curriculum.reduce((sum, lesson) => sum + (lesson.steps?.length || 0), 0)
      });
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

// ✅ NEW: Debug endpoint to check course content structure
router.get('/admin/:id/debug', authenticateUser, async (req, res) => {
  try {
    const course = await UpdatedCourse.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    const analysis = {
      courseId: course._id,
      title: course.title,
      lessons: []
    };

    const contentIssues = [];
    let totalSteps = 0;
    let stepsWithContent = 0;
    let explanationSteps = 0;

    course.curriculum?.forEach((lesson, lessonIndex) => {
      const lessonAnalysis = {
        lessonIndex,
        title: lesson.title,
        totalSteps: lesson.steps?.length || 0,
        steps: []
      };

      lesson.steps?.forEach((step, stepIndex) => {
        totalSteps++;
        
        const hasContent = !!(step.content || step.data?.content || step.data?.instructions);
        const hasDataContent = !!(step.data && (step.data.content || step.data.instructions || step.data.length > 0));
        
        if (hasContent) stepsWithContent++;
        if (step.type === 'explanation') explanationSteps++;

        const stepAnalysis = {
          stepIndex,
          type: step.type,
          title: step.title || 'No title',
          hasContent,
          hasDataContent,
          contentLength: step.content?.length || 0,
          dataContentLength: step.data?.content?.length || step.data?.instructions?.length || 0,
          contentPreview: (step.content || step.data?.content || step.data?.instructions || 'No content').substring(0, 100)
        };

        // Check for issues
        if (['explanation', 'example', 'reading'].includes(step.type) && !hasContent) {
          contentIssues.push({
            lesson: `Lesson ${lessonIndex + 1}`,
            step: `Step ${stepIndex + 1}`,
            issue: `${step.type} step has no content`
          });
        }

        lessonAnalysis.steps.push(stepAnalysis);
      });

      analysis.lessons.push(lessonAnalysis);
    });

    const summary = {
      totalSteps,
      stepsWithContent,
      explanationSteps,
      contentIssues
    };

    res.json({
      success: true,
      debug: {
        analysis,
        summary
      }
    });

  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to debug course'
    });
  }
});

// ✅ NEW: Fix content endpoint to automatically repair content issues
router.post('/admin/:id/fix-content', authenticateUser, async (req, res) => {
  try {
    const course = await UpdatedCourse.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    let fixesApplied = 0;
    const fixLog = [];

    course.curriculum?.forEach((lesson, lessonIndex) => {
      lesson.steps?.forEach((step, stepIndex) => {
        let fixed = false;

        // Fix explanation steps without content
        if (['explanation', 'example', 'reading'].includes(step.type)) {
          if (!step.content && !step.data?.content) {
            const defaultContent = `This is a ${step.type} step. Content will be added here to explain the concept in detail.`;
            
            if (!step.data) step.data = {};
            step.data.content = defaultContent;
            step.content = defaultContent;
            
            fixed = true;
            fixLog.push(`Fixed ${step.type} step in lesson ${lessonIndex + 1}, step ${stepIndex + 1}`);
          } else if (step.content && !step.data?.content) {
            // Ensure content is in data.content
            if (!step.data) step.data = {};
            step.data.content = step.content;
            fixed = true;
            fixLog.push(`Synced content to data.content in lesson ${lessonIndex + 1}, step ${stepIndex + 1}`);
          }
        }

        // Fix practice steps without instructions
        if (step.type === 'practice') {
          const hasInstructions = step.instructions || step.data?.instructions || step.content;
          if (!hasInstructions) {
            const defaultInstructions = 'Practice the concepts you have learned in this lesson.';
            
            if (!step.data) step.data = {};
            step.data.instructions = defaultInstructions;
            step.instructions = defaultInstructions;
            step.content = defaultInstructions;
            
            fixed = true;
            fixLog.push(`Added default instructions to practice step in lesson ${lessonIndex + 1}, step ${stepIndex + 1}`);
          }
        }

        // Ensure data structure exists
        if (!step.data) {
          step.data = {};
          fixed = true;
        }

        if (fixed) fixesApplied++;
      });
    });

    // Save the course with fixes
    if (fixesApplied > 0) {
      course.updatedBy = req.user.uid || req.user.email || 'admin';
      await course.save();
    }

    res.json({
      success: true,
      fixesApplied,
      fixLog,
      message: `Applied ${fixesApplied} content fixes`
    });

  } catch (error) {
    console.error('❌ Fix content error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fix course content'
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
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const [
      total,
      published,
      draft,
      archived,
      premium,
      free,
      recentlyCreated,
      categoryDistribution,
      difficultyDistribution,
      topInstructors
    ] = await Promise.all([
      UpdatedCourse.countDocuments(),
      UpdatedCourse.countDocuments({ status: 'published' }),
      UpdatedCourse.countDocuments({ status: 'draft' }),
      UpdatedCourse.countDocuments({ status: 'archived' }),
      UpdatedCourse.countDocuments({ isPremium: true }),
      UpdatedCourse.countDocuments({ isPremium: false }),
      UpdatedCourse.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      UpdatedCourse.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      UpdatedCourse.aggregate([
        { $group: { _id: '$difficulty', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      UpdatedCourse.aggregate([
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
      ])
    ]);

    const stats = {
      overview: {
        total,
        published,
        draft,
        archived,
        recentlyCreated
      },
      premium: {
        total: premium,
        free: free,
        premiumPercentage: total > 0 ? Math.round((premium / total) * 100) : 0
      },
      byCategory: categoryDistribution.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byDifficulty: difficultyDistribution.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byInstructor: topInstructors,
      engagement: {
        totalViews: await UpdatedCourse.aggregate([
          { $group: { _id: null, total: { $sum: '$metadata.views' } } }
        ]).then(result => result[0]?.total || 0),
        averageRating: await UpdatedCourse.aggregate([
          { $match: { rating: { $gt: 0 } } },
          { $group: { _id: null, avg: { $avg: '$rating' } } }
        ]).then(result => result[0]?.avg || 0),
        totalStudents: await UpdatedCourse.aggregate([
          { $group: { _id: null, total: { $sum: '$studentsCount' } } }
        ]).then(result => result[0]?.total || 0)
      }
    };

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

    console.log(`📦 Admin: Bulk importing ${courses.length} courses`);

    const createdBy = req.user.uid || req.user.email || 'admin';
    const coursesWithMeta = courses.map(course => {
      // ✅ Process curriculum for bulk import
      const processedCourse = {
        ...course,
        createdBy,
        updatedBy: createdBy
      };

      if (processedCourse.curriculum && Array.isArray(processedCourse.curriculum)) {
        processedCourse.curriculum = processedCourse.curriculum.map(lesson => {
          const processedLesson = {
            ...lesson,
            steps: (lesson.steps || []).map(step => {
              const processedStep = { ...step };
              
              // Ensure proper data structure for each step type
              switch (step.type) {
                case 'explanation':
                case 'example':
                case 'reading':
                  if (!processedStep.data) processedStep.data = {};
                  if (!processedStep.data.content && processedStep.content) {
                    processedStep.data.content = processedStep.content;
                  }
                  break;

                case 'practice':
                  if (!processedStep.data) processedStep.data = {};
                  if (!processedStep.data.instructions && processedStep.content) {
                    processedStep.data.instructions = processedStep.content;
                  }
                  break;
              }
              
              return processedStep;
            })
          };
          
          return processedLesson;
        });
      }

      return processedCourse;
    });

    const result = await UpdatedCourse.insertMany(coursesWithMeta, { 
      ordered: false // Continue on errors
    });

    console.log(`✅ Admin: Successfully imported ${result.length} courses`);

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

// ✅ NEW: Bulk operation routes for better admin management
router.post('/admin/bulk-update-status', authenticateUser, async (req, res) => {
  try {
    const { courseIds, status } = req.body;
    
    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No course IDs provided'
      });
    }

    if (!['draft', 'published', 'archived'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    const result = await UpdatedCourse.updateMany(
      { _id: { $in: courseIds } },
      { 
        status,
        updatedBy: req.user.uid || req.user.email || 'admin',
        updatedAt: new Date()
      }
    );

    res.json({
      success: true,
      updated: result.modifiedCount,
      message: `Updated ${result.modifiedCount} courses to ${status}`
    });

  } catch (error) {
    console.error('❌ Admin: Error in bulk status update:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update course statuses'
    });
  }
});

router.post('/admin/bulk-toggle-premium', authenticateUser, async (req, res) => {
  try {
    const { courseIds, isPremium } = req.body;
    
    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No course IDs provided'
      });
    }

    const result = await UpdatedCourse.updateMany(
      { _id: { $in: courseIds } },
      { 
        isPremium: Boolean(isPremium),
        updatedBy: req.user.uid || req.user.email || 'admin',
        updatedAt: new Date()
      }
    );

    res.json({
      success: true,
      updated: result.modifiedCount,
      message: `Updated ${result.modifiedCount} courses to ${isPremium ? 'premium' : 'free'}`
    });

  } catch (error) {
    console.error('❌ Admin: Error in bulk premium toggle:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update premium status'
    });
  }
});

router.delete('/admin/bulk-delete', authenticateUser, async (req, res) => {
  try {
    const { courseIds } = req.body;
    
    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No course IDs provided'
      });
    }

    const result = await UpdatedCourse.deleteMany({
      _id: { $in: courseIds }
    });

    res.json({
      success: true,
      deleted: result.deletedCount,
      message: `Deleted ${result.deletedCount} courses`
    });

  } catch (error) {
    console.error('❌ Admin: Error in bulk delete:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete courses'
    });
  }
});

// ✅ NEW: Content validation endpoint
router.post('/admin/validate-content', authenticateUser, async (req, res) => {
  try {
    const { courseData } = req.body;
    
    const validationResults = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Validate basic course data
    if (!courseData.title?.trim()) {
      validationResults.errors.push('Course title is required');
      validationResults.isValid = false;
    }

    if (!courseData.description?.trim()) {
      validationResults.errors.push('Course description is required');
      validationResults.isValid = false;
    }

    if (!courseData.category) {
      validationResults.errors.push('Course category is required');
      validationResults.isValid = false;
    }

    if (!courseData.instructor?.name?.trim()) {
      validationResults.errors.push('Instructor name is required');
      validationResults.isValid = false;
    }

    // Validate curriculum if not a guide
    if (!courseData.isGuide && courseData.curriculum && Array.isArray(courseData.curriculum)) {
      if (courseData.curriculum.length === 0) {
        validationResults.errors.push('At least one lesson is required for courses');
        validationResults.isValid = false;
      }

      courseData.curriculum.forEach((lesson, lessonIndex) => {
        if (!lesson.title?.trim()) {
          validationResults.errors.push(`Lesson ${lessonIndex + 1}: Title is required`);
          validationResults.isValid = false;
        }

        if (lesson.steps && lesson.steps.length > 0) {
          lesson.steps.forEach((step, stepIndex) => {
            const stepRef = `Lesson ${lessonIndex + 1}, Step ${stepIndex + 1}`;
            
            if (['explanation', 'example', 'reading'].includes(step.type)) {
              const hasContent = step.content?.trim() || step.data?.content?.trim();
              if (!hasContent) {
                validationResults.errors.push(`${stepRef}: ${step.type} content is required`);
                validationResults.isValid = false;
              } else if (hasContent.length < 50) {
                validationResults.warnings.push(`${stepRef}: Content is quite short (${hasContent.length} characters)`);
              }
            }

            if (step.type === 'practice') {
              const hasInstructions = step.content?.trim() || step.instructions?.trim() || step.data?.instructions?.trim();
              if (!hasInstructions) {
                validationResults.errors.push(`${stepRef}: Practice instructions are required`);
                validationResults.isValid = false;
              }
            }

            if (step.type === 'quiz') {
              const hasQuestion = step.content?.trim() || step.question?.trim();
              if (!hasQuestion) {
                validationResults.errors.push(`${stepRef}: Quiz question is required`);
                validationResults.isValid = false;
              }

              if (!step.options || step.options.length < 2) {
                validationResults.errors.push(`${stepRef}: Quiz needs at least 2 options`);
                validationResults.isValid = false;
              }
            }
          });
        } else {
          validationResults.warnings.push(`Lesson ${lessonIndex + 1}: No steps defined`);
        }
      });
    }

    res.json({
      success: true,
      validation: validationResults
    });

  } catch (error) {
    console.error('❌ Content validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate content'
    });
  }
});

module.exports = router;