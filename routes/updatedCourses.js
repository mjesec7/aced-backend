// routes/updatedCourses.js - ENHANCED WITH STRUCTURED JSON SUPPORT
const express = require('express');
const router = express.Router();
const UpdatedCourse = require('../models/updatedCourse');
const authenticateUser = require('../middlewares/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ========================================
// 🖼️ IMAGE UPLOAD MIDDLEWARE (unchanged)
// ========================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadType = req.body.uploadType || 'course-images';
    const uploadDir = path.join('uploads', uploadType);
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const uniqueName = uuidv4();
    const fileExtension = path.extname(file.originalname);
    cb(null, `${timestamp}_${uniqueName}${fileExtension}`);
  }
});

const imageFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 20
  }
});

// ========================================
// 📚 ENHANCED PUBLIC ROUTES (for main frontend)
// ========================================

// GET /api/updated-courses - Enhanced with structured JSON support
router.get('/', async (req, res) => {
  try {
    console.log('📚 Fetching updated courses with enhanced structure');
    
    const {
      category,
      difficulty,
      search,
      limit = 50,
      page = 1,
      sort = 'newest',
      type = 'all',
      format = 'standard' // ✅ NEW: 'standard' or 'structured'
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

    // ✅ NEW: Process courses based on format request
    const processedCourses = courses.map(course => {
      const baseCourse = {
        ...course,
        id: course._id.toString(),
        _id: course._id.toString(),
        isBookmarked: false,
        instructor: {
          name: course.instructor?.name || 'Unknown Instructor',
          avatar: processImageUrl(course.instructor?.avatar),
          bio: course.instructor?.bio || ''
        },
        thumbnail: processImageUrl(course.thumbnail)
      };

      // Return structured format if requested
      if (format === 'structured') {
        return {
          ...baseCourse,
          structuredData: convertCourseToStructuredFormat(course)
        };
      }

      // Standard format with backward compatibility
      return {
        ...baseCourse,
        curriculum: course.curriculum || course.lessons || []
      };
    });

    const total = await UpdatedCourse.countDocuments(filter);

    console.log(`✅ Returned ${processedCourses.length} courses in ${format} format`);

    res.json({
      success: true,
      courses: processedCourses,
      format: format,
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
      error: 'Failed to fetch courses',
      details: error.message
    });
  }
});

// ✅ NEW: GET /api/updated-courses/structured - Dedicated structured format endpoint
router.get('/structured', async (req, res) => {
  try {
    console.log('📚 Fetching courses in structured JSON format');

    const {
      category,
      difficulty,
      search,
      limit = 20,
      page = 1
    } = req.query;

    // Build filter
    const filter = { 
      isActive: true,
      status: 'published'
    };

    if (category && category !== 'all') filter.category = category;
    if (difficulty && difficulty !== 'all') filter.difficulty = difficulty;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const courses = await UpdatedCourse.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    // Convert each course to structured format
    const structuredCourses = courses.map(course => 
      convertCourseToStructuredFormat(course)
    );

    const total = await UpdatedCourse.countDocuments(filter);

    res.json({
      success: true,
      format: 'structured',
      courses: structuredCourses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('❌ Error fetching structured courses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch structured courses',
      details: error.message
    });
  }
});

// ✅ Enhanced GET /api/updated-courses/:id - Support both formats
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'standard' } = req.query;
    
    console.log(`📚 Fetching course ${id} in ${format} format`);

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

    let courseData;

    if (format === 'structured') {
      // ✅ NEW: Return structured format
      courseData = convertCourseToStructuredFormat(course.toObject());
    } else {
      // Standard format with backward compatibility
      courseData = {
        ...course.toObject(),
        id: course._id.toString(),
        _id: course._id.toString(),
        isBookmarked: false,
        // Convert curriculum/lessons for frontend compatibility
        lessons: course.lessons?.length ? 
          processLessonsFromStructured(course.lessons) : 
          processLessonsFromCurriculum(course.curriculum || []),
        thumbnail: processImageUrl(course.thumbnail),
        instructor: {
          ...course.instructor,
          avatar: processImageUrl(course.instructor?.avatar)
        }
      };
    }

    res.json({
      success: true,
      course: courseData,
      format: format
    });

  } catch (error) {
    console.error('❌ Error fetching course:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch course'
    });
  }
});

// ✅ Enhanced GET /api/updated-courses/:id/lessons
router.get('/:id/lessons', async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'standard' } = req.query;
    
    console.log(`📚 Fetching lessons for course ${id} in ${format} format`);

    const course = await UpdatedCourse.findOne({
      $or: [
        { _id: id },
        { 'seo.slug': id }
      ],
      isActive: true,
      status: 'published'
    }).select('lessons curriculum title category');

    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    let lessons;

    if (format === 'structured') {
      // ✅ NEW: Return structured lesson format
      lessons = course.lessons?.map((lesson, index) => ({
        id: lesson._id?.toString() || `lesson_${index}`,
        lessonNumber: lesson.lessonNumber || index + 1,
        title: lesson.title,
        duration: lesson.duration,
        content: lesson.content || {},
        topicId: course._id.toString(),
        subject: course.category || 'General'
      })) || [];
    } else {
      // Standard format for existing frontend
      const sourceLessons = course.lessons?.length ? course.lessons : course.curriculum || [];
      lessons = sourceLessons.map((lesson, index) => ({
        id: lesson._id?.toString() || `lesson_${index}`,
        _id: lesson._id?.toString() || `lesson_${index}`,
        title: lesson.title,
        lessonName: lesson.title,
        description: lesson.description,
        duration: lesson.duration || '30 min',
        order: lesson.order || index,
        topicId: course._id.toString(),
        subject: course.category || 'General',
        // Process steps from curriculum if available
        steps: lesson.steps ? processStepsForFrontend(lesson.steps, index) : []
      }));
    }

    res.json({
      success: true,
      data: lessons,
      lessons: lessons,
      format: format,
      source: course.lessons?.length ? 'structured-lessons' : 'curriculum-fallback'
    });

  } catch (error) {
    console.error('❌ Error fetching course lessons:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch course lessons'
    });
  }
});

router.get('/format/:format', async (req, res) => {
  try {
    const { format } = req.params;
    const { category, difficulty, search, limit = 50, page = 1 } = req.query;

    console.log(`📚 Fetching courses in ${format} format`);

    if (!['standard', 'structured'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Must be "standard" or "structured"'
      });
    }

    // Build filter
    const filter = { 
      isActive: true,
      status: 'published'
    };

    if (category && category !== 'all') filter.category = category;
    if (difficulty && difficulty !== 'all') filter.difficulty = difficulty;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const courses = await UpdatedCourse.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    let processedCourses;
    
    if (format === 'structured') {
      // Convert to structured format
      processedCourses = courses.map(course => 
        convertCourseToStructuredFormat(course)
      );
    } else {
      // Standard format
      processedCourses = courses.map(course => ({
        ...course,
        id: course._id.toString(),
        _id: course._id.toString(),
        isBookmarked: false,
        instructor: {
          name: course.instructor?.name || 'Unknown Instructor',
          avatar: processImageUrl(course.instructor?.avatar),
          bio: course.instructor?.bio || ''
        },
        thumbnail: processImageUrl(course.thumbnail),
        curriculum: course.curriculum || course.lessons || []
      }));
    }

    const total = await UpdatedCourse.countDocuments(filter);

    res.json({
      success: true,
      format: format,
      courses: processedCourses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('❌ Error fetching courses by format:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch courses',
      details: error.message
    });
  }
});
// ========================================
// 🛡️ ENHANCED ADMIN ROUTES
// ========================================

// ✅ Enhanced POST /api/updated-courses/admin - Support structured format creation
router.post('/admin', authenticateUser, async (req, res) => {
  try {
    console.log('📚 Admin: Creating new course with enhanced structure support');
    
    const courseData = {
      ...req.body,
      createdBy: req.user.uid || req.user.email || 'admin',
      updatedBy: req.user.uid || req.user.email || 'admin'
    };

    // ✅ Enhanced validation for both formats
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

    // ✅ NEW: Handle structured format input
    if (req.body.format === 'structured' || req.body.structuredData) {
      const structuredData = req.body.structuredData || req.body;
      
      // Process structured format
      if (structuredData.lessons && Array.isArray(structuredData.lessons)) {
        courseData.lessons = structuredData.lessons.map((lesson, index) => ({
          lessonNumber: lesson.lessonNumber || index + 1,
          title: lesson.title || `Lesson ${index + 1}`,
          duration: lesson.duration || '30 min',
          content: {
            theory: lesson.content?.theory || {},
            practical_examples: lesson.content?.practical_examples || {},
            homework: {
              theory_questions: lesson.content?.homework?.theory_questions || [],
              practical_tasks: lesson.content?.homework?.practical_tasks || []
            }
          }
        }));
      }

      // Process other structured fields
      if (structuredData.courseMetadata) {
        courseData.courseMetadata = {
          lastUpdated: new Date().toISOString(),
          author: structuredData.courseMetadata.author || courseData.instructor?.name,
          totalLessons: structuredData.lessons?.length || 0,
          totalDuration: structuredData.courseMetadata.totalDuration || courseData.duration,
          difficulty: structuredData.courseMetadata.difficulty || courseData.difficulty,
          courseDescription: structuredData.courseMetadata.courseDescription || courseData.description,
          language: structuredData.courseMetadata.language || 'ru',
          prerequisites: structuredData.courseMetadata.prerequisites || ''
        };
      }

      if (structuredData.finalProject) {
        courseData.finalProject = structuredData.finalProject;
      }

      if (structuredData.certification) {
        courseData.certification = structuredData.certification;
      }

      if (structuredData.career_advancement) {
        courseData.career_advancement = structuredData.career_advancement;
      }

      if (structuredData.nextSteps) {
        courseData.nextSteps = structuredData.nextSteps;
      }

      if (structuredData.community_resources) {
        courseData.community_resources = structuredData.community_resources;
      }
    }

    // ✅ ENHANCED: Process traditional curriculum format with improved image handling
    if (courseData.curriculum && Array.isArray(courseData.curriculum)) {
      console.log('📚 Processing traditional curriculum format');
      
      const contentIssues = [];
      
      courseData.curriculum = courseData.curriculum.map((lesson, lessonIndex) => {
        if (!lesson.title || !lesson.title.trim()) {
          contentIssues.push(`Lesson ${lessonIndex + 1}: Title is required`);
        }
        
        const processedLesson = {
          title: lesson.title || `Lesson ${lessonIndex + 1}`,
          description: lesson.description || '',
          duration: lesson.duration || '30 min',
          order: lesson.order || lessonIndex
        };

        // Process steps with enhanced image handling
        if (lesson.steps && Array.isArray(lesson.steps)) {
          processedLesson.steps = lesson.steps.map((step, stepIndex) => {
            const processedStep = {
              type: step.type || 'explanation',
              title: step.title || '',
              description: step.description || '',
              content: '',
              data: {},
              images: processImages(step.images || [], lessonIndex, stepIndex)
            };

            // Enhanced step type handling
            switch (step.type) {
              case 'explanation':
              case 'example':
              case 'reading':
                let explanationContent = extractContent(step);
                
                if (!explanationContent) {
                  explanationContent = `This is a ${step.type} step that explains an important concept.`;
                  console.warn(`⚠️ Created default content for ${step.type} step`);
                  contentIssues.push(`Lesson ${lessonIndex + 1}, Step ${stepIndex + 1}: ${step.type} step had no content - added default`);
                }
                
                processedStep.content = explanationContent;
                processedStep.data = {
                  content: explanationContent,
                  images: processedStep.images
                };
                break;

              case 'image':
                const imageDescription = step.content || step.description || '';
                processedStep.content = imageDescription;
                processedStep.data = {
                  images: processedStep.images,
                  description: imageDescription,
                  caption: step.caption || ''
                };

                if (processedStep.images.length === 0) {
                  contentIssues.push(`Lesson ${lessonIndex + 1}, Step ${stepIndex + 1}: Image step requires at least one image`);
                }
                break;

              case 'practice':
                const practiceInstructions = step.content || step.data?.instructions || step.instructions || '';
                
                if (!practiceInstructions.trim()) {
                  contentIssues.push(`Lesson ${lessonIndex + 1}, Step ${stepIndex + 1}: Practice instructions are required`);
                }
                
                processedStep.content = practiceInstructions;
                processedStep.data = {
                  instructions: practiceInstructions,
                  type: step.data?.type || step.practiceType || 'guided',
                  images: processedStep.images
                };
                processedStep.instructions = practiceInstructions;
                break;

              case 'quiz':
                let quizData = processQuizData(step);
                processedStep.content = quizData.length > 0 ? quizData[0].question : '';
                processedStep.data = quizData;
                processedStep.quizzes = quizData;
                
                if (quizData.length > 0) {
                  processedStep.question = quizData[0].question;
                  processedStep.options = quizData[0].options || [];
                  processedStep.correctAnswer = quizData[0].correctAnswer || 0;
                }
                break;

              default:
                const defaultContent = step.content || step.description || '';
                processedStep.content = defaultContent;
                processedStep.data = {
                  content: defaultContent,
                  images: processedStep.images
                };
            }

            return processedStep;
          });
        } else {
          processedLesson.steps = [];
        }

        return processedLesson;
      });

      // Enhanced validation
      const finalValidation = validateCourseContent(courseData.curriculum);
      
      if (finalValidation.length > 0) {
        console.warn('⚠️ Content validation issues:', finalValidation);
        // Don't block creation for minor issues, just log them
      }

      const curriculumStats = generateCurriculumStats(courseData.curriculum);
      console.log('📊 Curriculum statistics:', curriculumStats);
    } else {
      courseData.curriculum = [];
    }

    // ✅ Auto-populate courseMetadata if not provided
    if (!courseData.courseMetadata) {
      courseData.courseMetadata = {
        lastUpdated: new Date().toISOString(),
        author: courseData.instructor?.name || 'Unknown',
        totalLessons: courseData.lessons?.length || courseData.curriculum?.length || 0,
        totalDuration: courseData.duration || '10 hours',
        difficulty: courseData.difficulty || 'Beginner',
        courseDescription: courseData.description,
        language: 'ru',
        prerequisites: courseData.requirements?.join(', ') || ''
      };
    }

    // Create the course
    const course = new UpdatedCourse(courseData);
    await course.save();

    console.log('✅ Course created successfully:', course._id);

    res.status(201).json({
      success: true,
      course: course,
      message: 'Course created successfully with enhanced structure support'
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

// ✅ Enhanced PUT /api/updated-courses/admin/:id - Support structured format updates
router.put('/admin/:id', authenticateUser, async (req, res) => {
  try {
    console.log(`📚 Admin: Updating course ${req.params.id} with enhanced structure support`);
    
    const course = await UpdatedCourse.findById(req.params.id);
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    // Apply top-level updates
    Object.assign(course, req.body);
    course.updatedBy = req.user.uid || req.user.email || 'admin';
    
    // ✅ NEW: Handle structured format updates
    if (req.body.format === 'structured' || req.body.structuredData) {
      const structuredData = req.body.structuredData || req.body;
      
      console.log('📚 Processing structured format update');

      // Update structured lessons
      if (structuredData.lessons && Array.isArray(structuredData.lessons)) {
        course.lessons = structuredData.lessons.map((lesson, index) => ({
          lessonNumber: lesson.lessonNumber || index + 1,
          title: lesson.title || `Lesson ${index + 1}`,
          duration: lesson.duration || '30 min',
          content: {
            theory: lesson.content?.theory || {},
            practical_examples: lesson.content?.practical_examples || {},
            homework: {
              theory_questions: lesson.content?.homework?.theory_questions || [],
              practical_tasks: lesson.content?.homework?.practical_tasks || []
            }
          }
        }));
      }

      // Update courseMetadata
      if (structuredData.courseMetadata) {
        course.courseMetadata = {
          ...course.courseMetadata,
          ...structuredData.courseMetadata,
          lastUpdated: new Date().toISOString()
        };
      }

      // Update other structured fields
      if (structuredData.finalProject !== undefined) {
        course.finalProject = structuredData.finalProject;
      }

      if (structuredData.certification !== undefined) {
        course.certification = structuredData.certification;
      }

      if (structuredData.career_advancement !== undefined) {
        course.career_advancement = structuredData.career_advancement;
      }

      if (structuredData.nextSteps !== undefined) {
        course.nextSteps = structuredData.nextSteps;
      }

      if (structuredData.community_resources !== undefined) {
        course.community_resources = structuredData.community_resources;
      }
    }

    // ✅ Process traditional curriculum updates
    if (req.body.curriculum && Array.isArray(req.body.curriculum)) {
      console.log('📚 Processing traditional curriculum update');
      
      const processedCurriculum = req.body.curriculum.map((lesson, lessonIndex) => {
        const processedLesson = {
          title: lesson.title || `Lesson ${lessonIndex + 1}`,
          description: lesson.description || '',
          duration: lesson.duration || '30 min',
          order: lesson.order || lessonIndex
        };

        if (lesson.steps && Array.isArray(lesson.steps)) {
          processedLesson.steps = lesson.steps.map((step, stepIndex) => {
            const processedStep = {
              type: step.type || 'explanation',
              title: step.title || '',
              description: step.description || '',
              content: '',
              data: {},
              images: processImages(step.images || [], lessonIndex, stepIndex)
            };

            switch (step.type) {
              case 'explanation':
              case 'example':
              case 'reading':
                const explanationContent = extractContent(step);
                processedStep.content = explanationContent;
                processedStep.data = { content: explanationContent, images: processedStep.images };
                break;
              case 'image':
                const imageDescription = step.content || step.description || '';
                processedStep.content = imageDescription;
                processedStep.data = { images: processedStep.images, description: imageDescription };
                break;
              case 'practice':
                const practiceInstructions = extractContent(step) || step.instructions || '';
                processedStep.content = practiceInstructions;
                processedStep.data = { 
                  instructions: practiceInstructions, 
                  type: step.data?.type || step.practiceType || 'guided', 
                  images: processedStep.images 
                };
                processedStep.instructions = practiceInstructions;
                break;
              case 'quiz':
                const quizData = processQuizData(step);
                processedStep.content = quizData.length > 0 ? quizData[0].question : '';
                processedStep.data = quizData;
                processedStep.quizzes = quizData;
                if (quizData.length > 0) {
                  processedStep.question = quizData[0].question;
                  processedStep.options = quizData[0].options || [];
                  processedStep.correctAnswer = quizData[0].correctAnswer || 0;
                }
                break;
              default:
                const defaultContent = extractContent(step);
                processedStep.content = defaultContent;
                processedStep.data = { content: defaultContent, images: processedStep.images };
            }
            return processedStep;
          });
        } else {
          processedLesson.steps = [];
        }
        return processedLesson;
      });

      course.curriculum = processedCurriculum;

      const validationIssues = validateCourseContent(course.curriculum);
      if (validationIssues.length > 0) {
        console.warn('⚠️ Content validation issues:', validationIssues);
      }
      
      const updateStats = generateCurriculumStats(course.curriculum);
      console.log('📊 Update statistics:', updateStats);
    }
    
    // Auto-update courseMetadata
    if (!course.courseMetadata) {
      course.courseMetadata = {};
    }
    course.courseMetadata.lastUpdated = new Date().toISOString();
    if (course.lessons?.length) {
      course.courseMetadata.totalLessons = course.lessons.length;
    } else if (course.curriculum?.length) {
      course.courseMetadata.totalLessons = course.curriculum.length;
    }

    // Save the updated course
    await course.save();

    console.log('✅ Course updated successfully:', course._id);

    res.json({
      success: true,
      course: course,
      message: 'Course updated successfully with enhanced structure support'
    });

  } catch (error) {
    console.error('❌ Admin: Error updating course:', error);
    
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

// ✅ NEW: Convert existing course to structured format
router.post('/admin/:id/convert-to-structured', authenticateUser, async (req, res) => {
  try {
    console.log(`📚 Admin: Converting course ${req.params.id} to structured format`);

    const course = await UpdatedCourse.findById(req.params.id);
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    // Use the model method to convert
    const structuredFormat = course.convertToStructuredFormat();
    
    // Save the updated course with structured lessons
    await course.save();

    console.log('✅ Course converted to structured format successfully');

    res.json({
      success: true,
      message: 'Course converted to structured format successfully',
      structuredFormat: structuredFormat,
      course: course
    });

  } catch (error) {
    console.error('❌ Error converting course to structured format:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to convert course to structured format',
      details: error.message
    });
  }
});

// ✅ NEW: Validate structured course data
router.post('/admin/validate-structured', authenticateUser, async (req, res) => {
  try {
    console.log('📚 Admin: Validating structured course data');

    const { structuredData } = req.body;
    
    const validationResults = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Validate top-level structure
    if (!structuredData.courseTitle) {
      validationResults.errors.push('courseTitle is required');
      validationResults.isValid = false;
    }

    if (!structuredData.courseMetadata) {
      validationResults.errors.push('courseMetadata is required');
      validationResults.isValid = false;
    } else {
      // Validate courseMetadata
      const metadata = structuredData.courseMetadata;
      if (!metadata.author) {
        validationResults.errors.push('courseMetadata.author is required');
        validationResults.isValid = false;
      }
      if (!metadata.courseDescription) {
        validationResults.errors.push('courseMetadata.courseDescription is required');
        validationResults.isValid = false;
      }
    }

    // Validate lessons
    if (!structuredData.lessons || !Array.isArray(structuredData.lessons)) {
      validationResults.errors.push('lessons array is required');
      validationResults.isValid = false;
    } else if (structuredData.lessons.length === 0) {
      validationResults.warnings.push('No lessons defined');
    } else {
      structuredData.lessons.forEach((lesson, index) => {
        if (!lesson.title) {
          validationResults.errors.push(`Lesson ${index + 1}: title is required`);
          validationResults.isValid = false;
        }
        if (!lesson.content) {
          validationResults.warnings.push(`Lesson ${index + 1}: no content defined`);
        } else {
          // Validate lesson content structure
          if (!lesson.content.theory && !lesson.content.practical_examples) {
            validationResults.warnings.push(`Lesson ${index + 1}: no theory or practical examples`);
          }
        }
      });
    }

    // Validate optional sections
    if (structuredData.finalProject && !structuredData.finalProject.title) {
      validationResults.warnings.push('Final project has no title');
    }

    if (structuredData.certification && !structuredData.certification.title) {
      validationResults.warnings.push('Certification has no title');
    }

    res.json({
      success: true,
      validation: validationResults
    });

  } catch (error) {
    console.error('❌ Error validating structured course data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate structured course data',
      details: error.message
    });
  }
});

// [Rest of the existing routes remain unchanged...]

// ========================================
// 🔧 HELPER FUNCTIONS FOR STRUCTURED FORMAT
// ========================================

/**
 * Convert course data to structured JSON format
 */
function convertCourseToStructuredFormat(course) {
  // Use lessons if available, otherwise convert from curriculum
  let lessons = [];
  
  if (course.lessons && course.lessons.length > 0) {
    lessons = course.lessons.map(lesson => ({
      lessonNumber: lesson.lessonNumber,
      title: lesson.title,
      duration: lesson.duration,
      content: lesson.content || {
        theory: {},
        practical_examples: {},
        homework: {
          theory_questions: [],
          practical_tasks: []
        }
      }
    }));
  } else if (course.curriculum && course.curriculum.length > 0) {
    // Convert curriculum to structured lessons
    lessons = course.curriculum.map((curriculumItem, index) => {
      const theorySteps = curriculumItem.steps?.filter(step => 
        ['explanation', 'reading', 'example'].includes(step.type)
      ) || [];
      
      const practicalSteps = curriculumItem.steps?.filter(step => 
        ['practice', 'image'].includes(step.type)
      ) || [];

      const quizSteps = curriculumItem.steps?.filter(step => 
        step.type === 'quiz'
      ) || [];

      return {
        lessonNumber: index + 1,
        title: curriculumItem.title,
        duration: curriculumItem.duration || '30 min',
        content: {
          theory: {
            concepts: theorySteps.map(step => ({
              title: step.title,
              content: step.content || step.data?.content,
              images: step.images || []
            }))
          },
          practical_examples: {
            exercises: practicalSteps.map(step => ({
              title: step.title,
              instructions: step.content || step.data?.instructions,
              images: step.images || []
            }))
          },
          homework: {
            theory_questions: quizSteps.map(step => 
              step.content || step.data?.question || ''
            ).filter(q => q),
            practical_tasks: practicalSteps.map(step => 
              `Complete the exercise: ${step.title || 'Practice task'}`
            )
          }
        }
      };
    });
  }

  return {
    courseTitle: course.title,
    courseMetadata: {
      lastUpdated: course.courseMetadata?.lastUpdated || course.updatedAt?.toISOString() || new Date().toISOString(),
      author: course.courseMetadata?.author || course.instructor?.name || 'Unknown',
      totalLessons: lessons.length,
      totalDuration: course.courseMetadata?.totalDuration || course.duration || '10 hours',
      difficulty: course.courseMetadata?.difficulty || course.difficulty || 'Beginner',
      courseDescription: course.courseMetadata?.courseDescription || course.description || '',
      language: course.courseMetadata?.language || course.language || 'ru',
      prerequisites: course.courseMetadata?.prerequisites || course.requirements?.join(', ') || ''
    },
    lessons: lessons,
    finalProject: course.finalProject || {},
    certification: course.certification || {},
    career_advancement: course.career_advancement || [],
    nextSteps: course.nextSteps || [],
    community_resources: course.community_resources || []
  };
}

/**
 * Process lessons from structured format for frontend compatibility
 */
function processLessonsFromStructured(lessons) {
  return lessons.map((lesson, index) => ({
    id: lesson._id?.toString() || `lesson_${index}`,
    _id: lesson._id?.toString() || `lesson_${index}`,
    title: lesson.title,
    lessonName: lesson.title,
    description: extractDescriptionFromContent(lesson.content),
    duration: lesson.duration || '30 min',
    order: lesson.lessonNumber - 1 || index,
    steps: convertStructuredContentToSteps(lesson.content, index)
  }));
}

/**
 * Convert structured lesson content to steps for frontend
 */
function convertStructuredContentToSteps(content, lessonIndex) {
  const steps = [];
  let stepIndex = 0;

  // Add theory content as explanation steps
  if (content.theory?.concepts) {
    content.theory.concepts.forEach(concept => {
      steps.push({
        id: `step_${lessonIndex}_${stepIndex++}`,
        type: 'explanation',
        title: concept.title || 'Theory',
        content: concept.content || '',
        data: {
          content: concept.content || '',
          images: concept.images || []
        },
        images: concept.images || []
      });
    });
  }

  // Add practical examples as practice steps
  if (content.practical_examples?.exercises) {
    content.practical_examples.exercises.forEach(exercise => {
      steps.push({
        id: `step_${lessonIndex}_${stepIndex++}`,
        type: 'practice',
        title: exercise.title || 'Practice',
        content: exercise.instructions || '',
        data: {
          instructions: exercise.instructions || '',
          type: 'guided',
          images: exercise.images || []
        },
        images: exercise.images || []
      });
    });
  }

  // Add homework questions as quiz steps
  if (content.homework?.theory_questions?.length > 0) {
    steps.push({
      id: `step_${lessonIndex}_${stepIndex++}`,
      type: 'quiz',
      title: 'Quiz',
      content: content.homework.theory_questions[0],
      data: content.homework.theory_questions.map((question, qIndex) => ({
        question: question,
        type: 'multiple-choice',
        options: [
          { text: 'Option A' },
          { text: 'Option B' },
          { text: 'Option C' }
        ],
        correctAnswer: 0,
        explanation: 'Review the lesson material for the correct answer.'
      }))
    });
  }

  return steps;
}

/**
 * Extract description from structured content
 */
function extractDescriptionFromContent(content) {
  if (content.theory?.concepts?.length > 0) {
    const firstConcept = content.theory.concepts[0];
    return firstConcept.content?.substring(0, 200) + '...' || '';
  }
  return 'Lesson content';
}

/**
 * Process lessons from curriculum for frontend compatibility
 */
function processLessonsFromCurriculum(curriculum) {
  return curriculum.map((lesson, index) => ({
    id: lesson._id?.toString() || `lesson_${index}`,
    _id: lesson._id?.toString() || `lesson_${index}`,
    title: lesson.title,
    lessonName: lesson.title,
    description: lesson.description,
    duration: lesson.duration || '30 min',
    order: lesson.order || index,
    steps: processStepsForFrontend(lesson.steps || [], index)
  }));
}

/**
 * Process steps for frontend compatibility
 */
function processStepsForFrontend(steps, lessonIndex) {
  return steps.map((step, stepIndex) => ({
    id: `step_${lessonIndex}_${stepIndex}`,
    type: step.type,
    title: step.title,
    description: step.description,
    content: step.content,
    data: step.data || {},
    images: step.images || []
  }));
}

/**
 * Process image URLs
 */
function processImageUrl(imageUrl) {
  if (!imageUrl) return null;

  if (imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  if (imageUrl.startsWith('/uploads/')) {
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://api.aced.live' 
      : 'http://localhost:5000';
    return `${baseUrl}${imageUrl}`;
  }

  if (imageUrl.startsWith('/') && !imageUrl.startsWith('//')) {
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://api.aced.live' 
      : 'http://localhost:5000';
    return `${baseUrl}${imageUrl}`;
  }

  if (imageUrl.startsWith('http')) {
    return imageUrl;
  }

  return imageUrl;
}

// [Include all the existing helper functions for image processing, content extraction, etc.]

/**
 * Process and validate images array
 */
function processImages(images, lessonIndex, stepIndex) {
  if (!Array.isArray(images)) return [];
  
  return images
    .filter(img => img && (img.url || img.base64))
    .map((img, imgIndex) => ({
      id: img.id || `img_${lessonIndex}_${stepIndex}_${imgIndex}`,
      url: processImageUrl(img.url) || img.base64,
      caption: img.caption || '',
      filename: img.filename || `image_${imgIndex}`,
      size: img.size || 0,
      alt: img.alt || img.caption || `Image ${imgIndex + 1}`,
      order: img.order || imgIndex
    }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Extract content from step object
 */
function extractContent(step) {
  if (step.content && typeof step.content === 'string' && step.content.trim()) {
    return step.content.trim();
  }
  
  if (step.data?.content && typeof step.data.content === 'string' && step.data.content.trim()) {
    return step.data.content.trim();
  }
  
  if (step.description && step.description.trim()) {
    return step.description.trim();
  }
  
  return '';
}

/**
 * Process quiz data
 */
function processQuizData(step) {
  let quizData = [];
  
  if (step.data && Array.isArray(step.data) && step.data.length > 0) {
    quizData = step.data;
  } else if (step.question || step.content) {
    const quizQuestion = step.question || step.content || '';
    
    quizData = [{
      question: quizQuestion,
      type: step.quizType || 'multiple-choice',
      options: (step.options || []).map(opt => ({ text: opt.text || opt })),
      correctAnswer: parseInt(step.correctAnswer) || 0,
      explanation: step.explanation || '',
      images: processImages(step.questionImages || [], 0, 0)
    }];
  } else if (step.quizzes && Array.isArray(step.quizzes)) {
    quizData = step.quizzes.map(quiz => ({
      ...quiz,
      images: processImages(quiz.images || [], 0, 0)
    }));
  }
  
  return quizData;
}

/**
 * Validate course content
 */
function validateCourseContent(curriculum) {
  const issues = [];
  
  curriculum.forEach((lesson, lIndex) => {
    lesson.steps?.forEach((step, sIndex) => {
      const stepRef = `Lesson ${lIndex + 1}, Step ${sIndex + 1}`;
      
      if (['explanation', 'example', 'reading'].includes(step.type)) {
        if (!step.content || !step.content.trim()) {
          issues.push(`${stepRef}: Missing content field`);
        }
        if (!step.data?.content || !step.data.content.trim()) {
          issues.push(`${stepRef}: Missing data.content field`);
        }
      }
      
      if (step.type === 'image') {
        if (!step.images || step.images.length === 0) {
          issues.push(`${stepRef}: Image step requires at least one image`);
        }
      }
      
      if (step.type === 'quiz') {
        if (!step.data || step.data.length === 0) {
          issues.push(`${stepRef}: Quiz step requires questions`);
        }
      }
    });
  });
  
  return issues;
}

/**
 * Generate curriculum statistics
 */
function generateCurriculumStats(curriculum) {
  return {
    totalLessons: curriculum.length,
    totalSteps: curriculum.reduce((sum, lesson) => sum + (lesson.steps?.length || 0), 0),
    totalImages: curriculum.reduce((sum, lesson) => 
      sum + (lesson.steps?.reduce((stepSum, step) => 
        stepSum + (step.images?.length || 0), 0) || 0), 0),
    explanationSteps: curriculum.reduce((sum, lesson) => 
      sum + (lesson.steps?.filter(step => step.type === 'explanation').length || 0), 0),
    imageSteps: curriculum.reduce((sum, lesson) => 
      sum + (lesson.steps?.filter(step => step.type === 'image').length || 0), 0),
    stepsWithContent: curriculum.reduce((sum, lesson) => 
      sum + (lesson.steps?.filter(step => 
        step.content && step.content.trim()
      ).length || 0), 0)
  };
}

// [Include remaining existing routes: DELETE, PATCH, GET stats, bulk operations, etc.]

// DELETE /api/updated-courses/admin/:id
router.delete('/admin/:id', authenticateUser, async (req, res) => {
  try {
    const course = await UpdatedCourse.findByIdAndDelete(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    res.json({
      success: true,
      message: 'Course deleted successfully'
    });

  } catch (error) {
    console.error('❌ Admin: Error deleting course:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete course',
      details: error.message
    });
  }
});

// PATCH /api/updated-courses/admin/:id/status
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

// PATCH /api/updated-courses/admin/:id/toggle-premium
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

// GET /api/updated-courses/admin/stats
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
      structured,
      traditional
    ] = await Promise.all([
      UpdatedCourse.countDocuments(),
      UpdatedCourse.countDocuments({ status: 'published' }),
      UpdatedCourse.countDocuments({ status: 'draft' }),
      UpdatedCourse.countDocuments({ status: 'archived' }),
      UpdatedCourse.countDocuments({ isPremium: true }),
      UpdatedCourse.countDocuments({ isPremium: false }),
      UpdatedCourse.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      UpdatedCourse.countDocuments({ 'lessons.0': { $exists: true } }),
      UpdatedCourse.countDocuments({ 'curriculum.0': { $exists: true } })
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
      format: {
        structured: structured,
        traditional: traditional,
        mixed: total - structured - traditional
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

module.exports = router;