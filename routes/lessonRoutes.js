const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Models with error handling
let Lesson, Topic;
try {
  Lesson = require('../models/lesson');
  Topic = require('../models/topic');
  console.log('✅ Lesson models loaded successfully');
} catch (modelError) {
  console.error('❌ Failed to load lesson models:', modelError.message);
}

// Middleware with error handling
let verifyToken;
try {
  verifyToken = require('../middlewares/authMiddleware');
  console.log('✅ Auth middleware loaded successfully');
} catch (authError) {
  console.error('❌ Failed to load auth middleware:', authError.message);
  // Fallback middleware that skips auth in development
  verifyToken = (req, res, next) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️ Skipping auth in development mode');
      next();
    } else {
      res.status(500).json({ error: 'Auth middleware not available' });
    }
  };
}

// Import controller functions with error handling
let addLesson, updateLesson, deleteLesson, getLesson, getLessonsByTopic, bulkCreateLessons;

try {
  const lessonController = require('../controllers/lessonController');
  addLesson = lessonController.addLesson;
  updateLesson = lessonController.updateLesson;
  deleteLesson = lessonController.deleteLesson;
  getLesson = lessonController.getLesson;
  getLessonsByTopic = lessonController.getLessonsByTopic;
  bulkCreateLessons = lessonController.bulkCreateLessons;
  console.log('✅ Lesson controller functions loaded successfully');
} catch (error) {
  console.error('❌ Failed to load lesson controller:', error.message);
  console.log('⚠️ Using fallback lesson handlers');
}

// ─── Middleware: Logging ─────────────────────────────
router.use((req, res, next) => {
  console.log(`📢 [LESSONS] [${req.method}] ${req.originalUrl}`);
  next();
});

// ─── Middleware: Validate ObjectId ──────────────────
function validateObjectId(req, res, next) {
  const { id, topicId } = req.params;
  const idToValidate = id || topicId;
  
  if (idToValidate && !mongoose.Types.ObjectId.isValid(idToValidate)) {
    console.warn(`⚠️ Invalid ObjectId: ${idToValidate}`);
    return res.status(400).json({ 
      success: false,
      message: '❌ Invalid ID format' 
    });
  }
  next();
}

// ✅ ENHANCED: Fallback lesson creation with detailed error handling
const enhancedFallbackAddLesson = async (req, res) => {
  console.log('\n🚀 ENHANCED: Starting lesson creation process...');
  
  try {
    // Step 1: Check database connection
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ ENHANCED: Database not connected, state:', mongoose.connection.readyState);
      return res.status(503).json({
        success: false,
        error: 'Database connection unavailable',
        step: 'database_check'
      });
    }

    // Step 2: Check if models are available
    if (!Lesson || !Topic) {
      console.error('❌ ENHANCED: Models not available');
      return res.status(500).json({
        success: false,
        error: 'Database models not available',
        step: 'models_check'
      });
    }

    // Step 3: Extract and validate data
    const {
      subject,
      level,
      topic,
      topicDescription,
      lessonName,
      description,
      type,
      steps,
      createHomework,
      homeworkTitle,
      homeworkInstructions,
      relatedSubjects,
      translations,
      isDraft
    } = req.body;

    console.log('📥 ENHANCED: Received lesson data:', {
      subject,
      level,
      topic,
      lessonName,
      stepsCount: steps?.length || 0
    });

    // Enhanced validation
    const missingFields = [];
    if (!subject?.trim()) missingFields.push('subject');
    if (!level || isNaN(parseInt(level))) missingFields.push('level');
    if (!topic?.trim()) missingFields.push('topic');
    if (!lessonName?.trim()) missingFields.push('lessonName');
    if (!description?.trim()) missingFields.push('description');
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      missingFields.push('steps');
    }

    if (missingFields.length > 0) {
      console.error('❌ ENHANCED: Missing required fields:', missingFields);
      return res.status(400).json({ 
        success: false,
        error: 'Required fields missing',
        missingFields: missingFields,
        step: 'validation'
      });
    }

    // Step 4: Topic resolution
    console.log('🔍 ENHANCED: Resolving topic...');
    let resolvedTopic = null;
    const topicName = topic.trim();
    const topicDesc = topicDescription?.trim() || '';

    try {
      resolvedTopic = await Topic.findOne({ 
        subject: subject.trim(), 
        level: parseInt(level), 
        name: topicName 
      });

      if (!resolvedTopic) {
        console.log('🆕 ENHANCED: Creating new topic:', topicName);
        resolvedTopic = new Topic({ 
          name: topicName, 
          subject: subject.trim(), 
          level: parseInt(level), 
          description: topicDesc 
        });
        await resolvedTopic.save();
        console.log('✅ ENHANCED: Topic created with ID:', resolvedTopic._id);
      } else {
        console.log('✅ ENHANCED: Found existing topic with ID:', resolvedTopic._id);
      }
    } catch (topicError) {
      console.error('❌ ENHANCED: Topic resolution failed:', topicError);
      return res.status(500).json({
        success: false,
        error: 'Topic creation failed',
        details: topicError.message,
        step: 'topic_resolution'
      });
    }

    // Step 5: Process steps
    console.log('🔍 ENHANCED: Processing lesson steps...');
    const processedSteps = steps.map((step, index) => {
      const validTypes = [
        'explanation', 'example', 'practice', 'exercise', 
        'vocabulary', 'quiz', 'video', 'audio', 
        'reading', 'writing'
      ];
      
      const stepType = step.type || 'explanation';
      
      return {
        type: validTypes.includes(stepType) ? stepType : 'explanation',
        data: step.data || step.content || step || {}
      };
    });

    console.log(`✅ ENHANCED: Processed ${processedSteps.length} steps`);

    // Step 6: Create lesson object
    const lessonData = {
      subject: String(subject).trim(),
      level: Number(level),
      topic: resolvedTopic.name,
      topicId: resolvedTopic._id,
      lessonName: String(lessonName).trim(),
      description: String(description).trim(),
      type: type || 'free',
      
      steps: processedSteps,
      
      explanations: processedSteps
        .filter(s => s.type === 'explanation')
        .map(s => {
          if (typeof s.data === 'string') return s.data;
          if (s.data && s.data.content) return s.data.content;
          return '';
        })
        .filter(content => content.trim() !== ''),
      
      homework: {
        exercises: [],
        quizzes: [],
        totalExercises: 0
      },
      
      relatedSubjects: Array.isArray(relatedSubjects) ? relatedSubjects : [],
      translations: typeof translations === 'object' && translations !== null ? translations : {},
      
      isDraft: Boolean(isDraft),
      isActive: !Boolean(isDraft),
      
      stats: {
        viewCount: 0,
        completionRate: 0,
        averageRating: 0,
        totalRatings: 0
      }
    };

    // Step 7: Save lesson
    console.log('💾 ENHANCED: Saving lesson to database...');
    let newLesson;
    try {
      newLesson = new Lesson(lessonData);
      await newLesson.save();
      console.log(`✅ ENHANCED: Lesson saved with ID: ${newLesson._id}`);
    } catch (saveError) {
      console.error('❌ ENHANCED: Lesson save failed:', saveError);
      
      if (saveError.name === 'ValidationError') {
        const validationDetails = Object.values(saveError.errors).map(err => ({
          field: err.path,
          message: err.message
        }));
        
        return res.status(400).json({
          success: false,
          error: 'Lesson validation failed',
          validationErrors: validationDetails,
          step: 'lesson_save'
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Database save failed',
        details: saveError.message,
        step: 'lesson_save'
      });
    }

    // Step 8: Build response
    const response = {
      success: true,
      lesson: newLesson,
      homework: lessonData.homework,
      topic: {
        id: resolvedTopic._id,
        name: resolvedTopic.name,
        description: resolvedTopic.description
      },
      stats: {
        totalSteps: newLesson.steps.length,
        homeworkExercises: 0,
        explanationSteps: newLesson.steps.filter(s => s.type === 'explanation').length,
        exerciseSteps: newLesson.steps.filter(s => s.type === 'exercise').length,
        vocabularySteps: newLesson.steps.filter(s => s.type === 'vocabulary').length,
        quizSteps: newLesson.steps.filter(s => s.type === 'quiz').length
      },
      source: 'enhanced_fallback'
    };

    console.log(`🎉 ENHANCED: Lesson creation completed for "${newLesson.lessonName}"`);
    res.status(201).json(response);

  } catch (error) {
    console.error('\n❌ ENHANCED: Unexpected error:', error);
    console.error('❌ ENHANCED: Error stack:', error.stack);
    
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again',
      step: 'unexpected_error',
      details: process.env.NODE_ENV === 'development' ? {
        name: error.name,
        message: error.message
      } : undefined
    });
  }
};

// ✅ CRITICAL: Add debug endpoint to test before main endpoint
router.post('/debug', async (req, res) => {
  try {
    console.log('🔍 DEBUG: Endpoint hit');
    console.log('📊 DEBUG: MongoDB state:', mongoose.connection.readyState);
    console.log('📦 DEBUG: Models available:', { Lesson: !!Lesson, Topic: !!Topic });
    console.log('📝 DEBUG: Request body keys:', Object.keys(req.body));
    
    // Test basic database query
    if (Lesson && mongoose.connection.readyState === 1) {
      const count = await Lesson.countDocuments();
      console.log('📈 DEBUG: Lessons in database:', count);
    }
    
    res.json({
      success: true,
      message: 'Debug endpoint working',
      dbState: mongoose.connection.readyState,
      modelsAvailable: { Lesson: !!Lesson, Topic: !!Topic },
      requestBodyKeys: Object.keys(req.body),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ DEBUG: Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// ✅ Test endpoint
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ Lesson routes are working!',
    timestamp: new Date().toISOString(),
    dbState: mongoose.connection.readyState,
    modelsAvailable: { Lesson: !!Lesson, Topic: !!Topic },
    controllerAvailable: !!addLesson,
    endpoints: [
      'GET /api/lessons/test - This test endpoint',
      'POST /api/lessons/debug - Debug endpoint', 
      'GET /api/lessons - Get all lessons',
      'POST /api/lessons - Create lesson',
      'GET /api/lessons/:id - Get specific lesson',
      'PUT /api/lessons/:id - Update lesson',
      'DELETE /api/lessons/:id - Delete lesson'
    ]
  });
});

// ─── DELETE: All Lessons (Must come before /:id) ────
router.delete('/all', verifyToken, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const result = await Lesson.deleteMany({});
    console.log(`🧹 Deleted ${result.deletedCount} lessons`);
    res.status(200).json({ 
      success: true,
      message: `✅ Deleted ${result.deletedCount} lessons`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('❌ Error deleting all lessons:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error clearing lessons', 
      error: error.message 
    });
  }
});

// ✅ NEW: Bulk Create Lessons
router.post('/bulk', verifyToken, (req, res) => {
  if (bulkCreateLessons) {
    bulkCreateLessons(req, res);
  } else {
    res.status(501).json({
      success: false,
      message: 'Bulk create not available - controller not loaded'
    });
  }
});

// ✅ NEW: Get Lesson Statistics
router.get('/stats', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { subject, level, type } = req.query;
    
    // Build match filter
    const matchFilter = { isActive: true };
    if (subject) matchFilter.subject = subject;
    if (level) matchFilter.level = parseInt(level);
    if (type) matchFilter.type = type;

    const stats = await Lesson.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalLessons: { $sum: 1 },
          freeCount: { 
            $sum: { $cond: [{ $eq: ['$type', 'free'] }, 1, 0] } 
          },
          premiumCount: { 
            $sum: { $cond: [{ $eq: ['$type', 'premium'] }, 1, 0] } 
          },
          avgSteps: { $avg: { $size: '$steps' } },
          totalViews: { $sum: '$stats.viewCount' },
          avgRating: { $avg: '$stats.averageRating' }
        }
      }
    ]);

    const levelStats = await Lesson.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$level',
          count: { $sum: 1 },
          avgRating: { $avg: '$stats.averageRating' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const subjectStats = await Lesson.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$subject',
          count: { $sum: 1 },
          avgSteps: { $avg: { $size: '$steps' } }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      overall: stats[0] || {
        totalLessons: 0,
        freeCount: 0,
        premiumCount: 0,
        avgSteps: 0,
        totalViews: 0,
        avgRating: 0
      },
      byLevel: levelStats,
      bySubject: subjectStats
    });

  } catch (error) {
    console.error('❌ Error getting lesson stats:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Error getting statistics', 
      error: error.message 
    });
  }
});

// ✅ NEW: Search Lessons
router.get('/search', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { 
      q, 
      subject, 
      level, 
      type, 
      difficulty,
      hasHomework,
      stepType,
      page = 1, 
      limit = 20 
    } = req.query;

    // Build search query
    const query = { isActive: true };
    
    if (q) {
      query.$or = [
        { lessonName: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { topic: { $regex: q, $options: 'i' } }
      ];
    }
    
    if (subject) query.subject = subject;
    if (level) query.level = parseInt(level);
    if (type) query.type = type;
    if (difficulty) query['metadata.difficulty'] = difficulty;
    
    if (hasHomework === 'true') {
      query.$or = [
        { 'homework.exercises.0': { $exists: true } },
        { 'homework.quizzes.0': { $exists: true } }
      ];
    }
    
    if (stepType) {
      query['steps.type'] = stepType;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [lessons, totalCount] = await Promise.all([
      Lesson.find(query)
        .populate('topicId', 'name description')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Lesson.countDocuments(query)
    ]);

    res.json({
      success: true,
      lessons,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      },
      filters: { q, subject, level, type, difficulty, hasHomework, stepType }
    });

  } catch (error) {
    console.error('❌ Error searching lessons:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Search failed', 
      error: error.message 
    });
  }
});

// ✅ NEW: Duplicate Lesson
router.post('/:id/duplicate', verifyToken, validateObjectId, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const originalLesson = await Lesson.findById(req.params.id);
    if (!originalLesson) {
      return res.status(404).json({ 
        success: false,
        message: '❌ Lesson not found' 
      });
    }

    const duplicatedLesson = new Lesson({
      ...originalLesson.toObject(),
      _id: undefined,
      lessonName: `${originalLesson.lessonName} (Copy)`,
      isDraft: true,
      isActive: false,
      createdAt: undefined,
      updatedAt: undefined,
      stats: {
        viewCount: 0,
        completionRate: 0,
        averageRating: 0,
        totalRatings: 0
      }
    });

    await duplicatedLesson.save();
    
    console.log(`📋 Duplicated lesson: ${originalLesson.lessonName}`);
    res.status(201).json({
      success: true,
      lesson: duplicatedLesson
    });

  } catch (error) {
    console.error('❌ Error duplicating lesson:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Failed to duplicate lesson', 
      error: error.message 
    });
  }
});

// ✅ NEW: Toggle Lesson Status
router.patch('/:id/status', verifyToken, validateObjectId, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { isActive, isDraft } = req.body;
    
    const updateData = {};
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (typeof isDraft === 'boolean') updateData.isDraft = isDraft;
    
    // If publishing (not draft and active), set published date
    if (isDraft === false && isActive !== false) {
      updateData.publishedAt = new Date();
    }

    const lesson = await Lesson.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!lesson) {
      return res.status(404).json({ 
        success: false,
        message: '❌ Lesson not found' 
      });
    }

    console.log(`🔄 Status updated: ${lesson.lessonName}`);
    res.json({
      success: true,
      lesson
    });

  } catch (error) {
    console.error('❌ Error updating lesson status:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Failed to update status', 
      error: error.message 
    });
  }
});

// ─── GET: All Lessons (Enhanced) ────────────────────
router.get('/', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { 
      type, 
      subject, 
      level, 
      isActive, 
      isDraft,
      populate = 'false',
      sort = 'createdAt',
      order = 'desc'
    } = req.query;
    
    // Build filter
    const filter = {};
    if (type) filter.type = type;
    if (subject) filter.subject = subject;
    if (level) filter.level = parseInt(level);
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (isDraft !== undefined) filter.isDraft = isDraft === 'true';

    let query = Lesson.find(filter);
    
    // Add population if requested
    if (populate === 'true' && Topic) {
      query = query.populate('topicId', 'name description');
    }
    
    // Add sorting
    const sortOrder = order === 'desc' ? -1 : 1;
    query = query.sort({ [sort]: sortOrder });

    const lessons = await query.lean();
    
    console.log(`📄 Returned ${lessons.length} lessons (filter: ${JSON.stringify(filter)})`);
    res.status(200).json(lessons);

  } catch (error) {
    console.error('❌ Failed to fetch all lessons:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error fetching lessons', 
      error: error.message 
    });
  }
});

// ─── POST: New Lesson (Enhanced with fallback) ────────────────────
router.post('/', verifyToken, (req, res) => {
  console.log('📝 POST /api/lessons endpoint hit');
  
  if (addLesson) {
    console.log('✅ Using main lesson controller');
    try {
      addLesson(req, res);
    } catch (controllerError) {
      console.error('❌ Main controller failed:', controllerError);
      console.log('⚠️ Falling back to enhanced fallback');
      enhancedFallbackAddLesson(req, res);
    }
  } else {
    console.log('⚠️ Main controller not available, using enhanced fallback');
    enhancedFallbackAddLesson(req, res);
  }
});

// ─── GET: Lesson by Subject & Name ──────────────────
router.get('/by-name', async (req, res) => {
  const { subject, name } = req.query;
  if (!subject || !name) {
    return res.status(400).json({ 
      success: false,
      message: '❌ Missing subject or lesson name' 
    });
  }

  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const lessons = await Lesson.find({ 
      subject, 
      lessonName: name,
      isActive: true 
    }).populate('topicId', 'name description');
    
    if (!lessons.length) {
      return res.status(404).json({ 
        success: false,
        message: '❌ Lesson not found' 
      });
    }
    
    res.status(200).json({
      success: true,
      lesson: lessons[0]
    });
  } catch (error) {
    console.error('❌ Error fetching lesson by name:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error fetching lesson', 
      error: error.message 
    });
  }
});

// ─── GET: Lessons by Topic ID (Enhanced with fallback) ────────────
router.get('/topic/:topicId', validateObjectId, (req, res) => {
  if (getLessonsByTopic) {
    getLessonsByTopic(req, res);
  } else {
    // Fallback implementation
    res.status(501).json({
      success: false,
      message: 'Get lessons by topic not available - controller not loaded'
    });
  }
});

// ─── GET: Lesson by ID (Enhanced with fallback) ───────────────────
router.get('/:id', validateObjectId, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const lessonId = req.params.id;
    const lesson = await Lesson.findById(lessonId)
      .populate('topicId', 'name description subject level')
      .lean();

    if (!lesson) {
      return res.status(404).json({ 
        success: false,
        error: '❌ Lesson not found' 
      });
    }

    // Increment view count
    await Lesson.findByIdAndUpdate(lessonId, { 
      $inc: { 'stats.viewCount': 1 } 
    });

    console.log(`📘 Retrieved lesson: "${lesson.lessonName}"`);
    
    res.json({
      success: true,
      lesson,
      topic: lesson.topicId,
      stats: {
        totalSteps: lesson.steps?.length || 0,
        homeworkExercises: lesson.homework?.totalExercises || 0,
        viewCount: lesson.stats?.viewCount || 0
      }
    });

  } catch (error) {
    console.error('❌ Failed to retrieve lesson:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Failed to retrieve lesson',
      message: error.message
    });
  }
});

// ─── PUT: Update Lesson (Enhanced with fallback) ──────────────────
router.put('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const lessonId = req.params.id;
    const updates = req.body;
    updates.updatedAt = new Date();

    const updatedLesson = await Lesson.findByIdAndUpdate(
      lessonId, 
      updates, 
      { 
        new: true, 
        runValidators: true,
        context: 'query'
      }
    ).populate('topicId', 'name description');

    if (!updatedLesson) {
      return res.status(404).json({ 
        success: false,
        error: '❌ Lesson not found' 
      });
    }

    console.log(`✅ Updated lesson: "${updatedLesson.lessonName}"`);
    
    res.json({
      success: true,
      lesson: updatedLesson
    });

  } catch (error) {
    console.error('❌ Failed to update lesson:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        error: '❌ Validation failed',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: '❌ Update failed',
      message: error.message
    });
  }
});

// ─── DELETE: One Lesson (Enhanced with fallback) ──────────────────
router.delete('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const lessonId = req.params.id;
    const deletedLesson = await Lesson.findByIdAndDelete(lessonId);
    
    if (!deletedLesson) {
      return res.status(404).json({ 
        success: false,
        error: '❌ Lesson not found' 
      });
    }

    console.log(`🗑️ Deleted lesson: "${deletedLesson.lessonName}"`);
    res.json({ 
      success: true,
      message: '✅ Lesson deleted successfully',
      deletedLesson: {
        id: deletedLesson._id,
        name: deletedLesson.lessonName,
        topic: deletedLesson.topic
      }
    });

  } catch (error) {
    console.error('❌ Failed to delete lesson:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Failed to delete lesson',
      message: error.message
    });
  }
});

// ─── GET: Lessons by Subject ────────────────────────
router.get('/subject/:subject', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { subject } = req.params;
    const { level, type, includeStats } = req.query;
    
    console.log(`📚 Fetching lessons for subject: ${subject}`);
    
    const filter = { subject, isActive: true };
    if (level) filter.level = parseInt(level);
    if (type) filter.type = type;

    const lessons = await Lesson.find(filter)
      .populate('topicId', 'name description')
      .sort({ level: 1, createdAt: 1 });
    
    console.log(`✅ Found ${lessons.length} lessons for subject ${subject}`);
    
    const response = { 
      success: true,
      lessons 
    };
    
    if (includeStats === 'true') {
      response.stats = {
        total: lessons.length,
        byLevel: lessons.reduce((acc, lesson) => {
          acc[lesson.level] = (acc[lesson.level] || 0) + 1;
          return acc;
        }, {}),
        byType: lessons.reduce((acc, lesson) => {
          acc[lesson.type] = (acc[lesson.type] || 0) + 1;
          return acc;
        }, {})
      };
    }
    
    res.status(200).json(response);
  } catch (error) {
    console.error('❌ Error fetching lessons by subject:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error fetching lessons by subject', 
      error: error.message 
    });
  }
});

// ─── GET: Lessons Count by Topic ────────────────────
router.get('/count/by-topic', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const counts = await Lesson.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$topicId',
          count: { $sum: 1 },
          topic: { $first: '$topic' },
          subject: { $first: '$subject' },
          level: { $first: '$level' }
        }
      },
      { $sort: { subject: 1, level: 1 } }
    ]);
    
    console.log(`✅ Counted lessons for ${counts.length} topics`);
    res.status(200).json({
      success: true,
      counts
    });
  } catch (error) {
    console.error('❌ Error counting lessons by topic:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error counting lessons', 
      error: error.message 
    });
  }
});

// ✅ NEW: Export Lessons (for backup/migration)
router.get('/export/json', verifyToken, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { subject, level, type } = req.query;
    
    const filter = {};
    if (subject) filter.subject = subject;
    if (level) filter.level = parseInt(level);
    if (type) filter.type = type;

    const lessons = await Lesson.find(filter)
      .populate('topicId', 'name description')
      .lean();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=lessons-export.json');
    res.json({
      success: true,
      exportDate: new Date().toISOString(),
      totalLessons: lessons.length,
      filters: filter,
      lessons
    });

  } catch (error) {
    console.error('❌ Error exporting lessons:', error);
    res.status(500).json({ 
      success: false,
      message: '❌ Export failed', 
      error: error.message 
    });
  }
});

// ✅ Additional utility routes for lesson management

// Get lessons by multiple filters
router.post('/filter', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { filters, sort, limit, skip } = req.body;
    
    let query = Lesson.find(filters || {});
    
    if (sort) {
      query = query.sort(sort);
    }
    
    if (skip) {
      query = query.skip(skip);
    }
    
    if (limit) {
      query = query.limit(limit);
    }

    const lessons = await query.populate('topicId', 'name description').lean();
    const totalCount = await Lesson.countDocuments(filters || {});
    
    res.json({
      success: true,
      lessons,
      totalCount,
      hasMore: totalCount > (skip || 0) + lessons.length
    });

  } catch (error) {
    console.error('❌ Error filtering lessons:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get lesson summary statistics
router.get('/summary', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const [
      totalLessons,
      activeLessons,
      draftLessons,
      subjectCounts,
      levelCounts,
      typeCounts,
      recentLessons
    ] = await Promise.all([
      Lesson.countDocuments(),
      Lesson.countDocuments({ isActive: true }),
      Lesson.countDocuments({ isDraft: true }),
      Lesson.aggregate([
        { $group: { _id: '$subject', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Lesson.aggregate([
        { $group: { _id: '$level', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Lesson.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      Lesson.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('lessonName subject level createdAt')
        .lean()
    ]);

    res.json({
      success: true,
      summary: {
        total: totalLessons,
        active: activeLessons,
        draft: draftLessons,
        published: activeLessons - draftLessons
      },
      distribution: {
        bySubject: subjectCounts,
        byLevel: levelCounts,
        byType: typeCounts
      },
      recent: recentLessons
    });

  } catch (error) {
    console.error('❌ Error getting lesson summary:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Batch update lessons
router.patch('/batch', verifyToken, async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const { lessonIds, updates } = req.body;
    
    if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'lessonIds array is required'
      });
    }

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'updates object is required'
      });
    }

    // Add updated timestamp
    updates.updatedAt = new Date();

    const result = await Lesson.updateMany(
      { _id: { $in: lessonIds } },
      updates
    );

    console.log(`📝 Batch updated ${result.modifiedCount} lessons`);

    res.json({
      success: true,
      message: `✅ Updated ${result.modifiedCount} lessons`,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount
    });

  } catch (error) {
    console.error('❌ Error batch updating lessons:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Validate lesson data
router.post('/validate', async (req, res) => {
  try {
    if (!Lesson) {
      return res.status(500).json({
        success: false,
        error: 'Lesson model not available'
      });
    }

    const lessonData = req.body;
    
    // Create a new lesson instance for validation without saving
    const lesson = new Lesson(lessonData);
    
    try {
      await lesson.validate();
      res.json({
        success: true,
        message: '✅ Lesson data is valid',
        isValid: true
      });
    } catch (validationError) {
      const errors = Object.values(validationError.errors).map(err => ({
        field: err.path,
        message: err.message,
        value: err.value
      }));
      
      res.status(400).json({
        success: false,
        message: '❌ Validation failed',
        isValid: false,
        errors: errors
      });
    }

  } catch (error) {
    console.error('❌ Error validating lesson:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ✅ CRITICAL: Ensure proper module export
module.exports = router;