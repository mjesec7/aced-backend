const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const verifyToken = require('../middlewares/authMiddleware');

// Import controller functions - Updated with better error handling
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
  console.log('⚠️  Using fallback lesson handlers');
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

// ✅ CRITICAL FIX: Enhanced fallback lesson handlers for when controller fails
const fallbackAddLesson = async (req, res) => {
  try {
    console.log('📥 [Fallback] Creating lesson with data:', {
      subject: req.body.subject,
      level: req.body.level,
      topic: req.body.topic,
      lessonName: req.body.lessonName,
      stepsCount: req.body.steps?.length || 0
    });

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

    // Enhanced validation
    if (!subject || !level || !topic || !lessonName || !description) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Required fields missing: subject, level, topic, lessonName, description' 
      });
    }

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: '❌ At least one lesson step is required' 
      });
    }

    // Enhanced topic resolution
    let resolvedTopic = null;
    const topicName = typeof topic === 'string' ? topic.trim() : '';
    const topicDesc = typeof topicDescription === 'string' ? topicDescription.trim() : '';

    if (!topicName) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Topic name is required' 
      });
    }

    // Find existing topic or create new one
    resolvedTopic = await Topic.findOne({ 
      subject: subject.trim(), 
      level: parseInt(level), 
      name: topicName 
    });

    if (!resolvedTopic) {
      resolvedTopic = new Topic({ 
        name: topicName, 
        subject: subject.trim(), 
        level: parseInt(level), 
        description: topicDesc 
      });
      await resolvedTopic.save();
      console.log(`✅ [Fallback] Topic created: "${resolvedTopic.name}"`);
    }

    // Process steps
    const processedSteps = steps.map((step, index) => {
      return {
        type: step.type || 'explanation',
        data: step.data || step.content || step
      };
    });

    // Extract homework exercises if needed
    const homeworkData = {
      exercises: [],
      quizzes: [],
      totalExercises: 0
    };

    if (createHomework) {
      steps.forEach(step => {
        if (step.type === 'exercise' && step.exercises) {
          step.exercises.forEach(exercise => {
            if (exercise.includeInHomework) {
              homeworkData.exercises.push({
                question: exercise.question,
                correctAnswer: exercise.answer || exercise.correctAnswer,
                points: exercise.points || 1,
                type: 'short-answer'
              });
            }
          });
        }
        if (step.type === 'quiz' && step.quizzes) {
          homeworkData.quizzes.push(...step.quizzes);
        }
      });
      homeworkData.totalExercises = homeworkData.exercises.length + homeworkData.quizzes.length;
    }

    // Create lesson object
    const lessonData = {
      subject: String(subject).trim(),
      level: Number(level),
      topic: resolvedTopic.name,
      topicId: resolvedTopic._id,
      lessonName: String(lessonName).trim(),
      description: String(description).trim(),
      type: type || 'free',
      
      // Enhanced step structure
      steps: processedSteps,
      
      // Legacy support for explanations
      explanations: processedSteps
        .filter(s => s.type === 'explanation')
        .map(s => s.data.content || s.data || '')
        .filter(content => content.trim() !== ''),
      
      // Homework configuration
      homework: homeworkData,
      
      // Additional fields
      relatedSubjects: Array.isArray(relatedSubjects) ? relatedSubjects : [],
      translations: typeof translations === 'object' ? translations : {},
      
      // Status
      isDraft: Boolean(isDraft),
      isActive: !Boolean(isDraft),
      
      // Stats initialization
      stats: {
        viewCount: 0,
        completionRate: 0,
        averageRating: 0,
        totalRatings: 0
      }
    };

    console.log('📦 [Fallback] Creating lesson with enhanced structure');

    const newLesson = new Lesson(lessonData);
    await newLesson.save();

    console.log(`✅ [Fallback] Lesson created: "${newLesson.lessonName}" (ID: ${newLesson._id})`);
    
    // Return enhanced response
    const response = {
      success: true,
      lesson: newLesson,
      homework: homeworkData,
      topic: {
        id: resolvedTopic._id,
        name: resolvedTopic.name,
        description: resolvedTopic.description
      },
      stats: {
        totalSteps: newLesson.steps.length,
        homeworkExercises: homeworkData.totalExercises,
        explanationSteps: newLesson.steps.filter(s => s.type === 'explanation').length,
        exerciseSteps: newLesson.steps.filter(s => s.type === 'exercise').length,
        vocabularySteps: newLesson.steps.filter(s => s.type === 'vocabulary').length,
        quizSteps: newLesson.steps.filter(s => s.type === 'quiz').length
      },
      source: 'fallback_handler'
    };

    res.status(201).json(response);

  } catch (error) {
    console.error('❌ Fallback lesson creation error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        error: '❌ Validation failed',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    
    if (error.code === 11000) {
      return res.status(409).json({ 
        success: false,
        error: '❌ Duplicate lesson: similar lesson already exists' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: '❌ Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again',
      source: 'fallback_handler'
    });
  }
};

const fallbackUpdateLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    if (!lessonId || !mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Invalid lesson ID' 
      });
    }

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

    console.log(`✅ [Fallback] Updated lesson: "${updatedLesson.lessonName}"`);
    
    res.json({
      success: true,
      lesson: updatedLesson,
      source: 'fallback_handler'
    });

  } catch (error) {
    console.error('❌ Fallback lesson update error:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Update failed',
      message: error.message,
      source: 'fallback_handler'
    });
  }
};

const fallbackDeleteLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    if (!lessonId || !mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Invalid lesson ID' 
      });
    }

    const deletedLesson = await Lesson.findByIdAndDelete(lessonId);
    if (!deletedLesson) {
      return res.status(404).json({ 
        success: false,
        error: '❌ Lesson not found' 
      });
    }

    console.log(`🗑️ [Fallback] Deleted lesson: "${deletedLesson.lessonName}"`);
    res.json({ 
      success: true,
      message: '✅ Lesson deleted successfully',
      deletedLesson: {
        id: deletedLesson._id,
        name: deletedLesson.lessonName,
        topic: deletedLesson.topic
      },
      source: 'fallback_handler'
    });

  } catch (error) {
    console.error('❌ Fallback lesson delete error:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Failed to delete lesson',
      message: error.message,
      source: 'fallback_handler'
    });
  }
};

const fallbackGetLesson = async (req, res) => {
  try {
    const lessonId = req.params.id;
    if (!lessonId || !mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ 
        success: false,
        error: '❌ Invalid lesson ID' 
      });
    }

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

    console.log(`📘 [Fallback] Retrieved lesson: "${lesson.lessonName}"`);
    
    res.json({
      success: true,
      lesson,
      topic: lesson.topicId,
      stats: {
        totalSteps: lesson.steps?.length || 0,
        homeworkExercises: lesson.homework?.totalExercises || 0,
        viewCount: lesson.stats?.viewCount || 0
      },
      source: 'fallback_handler'
    });

  } catch (error) {
    console.error('❌ Fallback lesson get error:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Failed to retrieve lesson',
      message: error.message,
      source: 'fallback_handler'
    });
  }
};

// ─── DELETE: All Lessons (Must come before /:id) ────
router.delete('/all', verifyToken, async (req, res) => {
  try {
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
    if (populate === 'true') {
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
    addLesson(req, res);
  } else {
    console.log('⚠️ Main controller not available, using fallback');
    fallbackAddLesson(req, res);
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
router.get('/:id', validateObjectId, (req, res) => {
  if (getLesson) {
    getLesson(req, res);
  } else {
    fallbackGetLesson(req, res);
  }
});

// ─── PUT: Update Lesson (Enhanced with fallback) ──────────────────
router.put('/:id', verifyToken, validateObjectId, (req, res) => {
  if (updateLesson) {
    updateLesson(req, res);
  } else {
    fallbackUpdateLesson(req, res);
  }
});

// ─── DELETE: One Lesson (Enhanced with fallback) ──────────────────
router.delete('/:id', verifyToken, validateObjectId, (req, res) => {
  if (deleteLesson) {
    deleteLesson(req, res);
  } else {
    fallbackDeleteLesson(req, res);
  }
});

// ─── GET: Lessons by Subject ────────────────────────
router.get('/subject/:subject', async (req, res) => {
  const { subject } = req.params;
  const { level, type, includeStats } = req.query;
  
  console.log(`📚 Fetching lessons for subject: ${subject}`);
  
  try {
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

// ✅ CRITICAL FIX: Add test endpoint to verify routes are working
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ Lesson routes are working!',
    timestamp: new Date().toISOString(),
    controller: {
      addLesson: !!addLesson,
      updateLesson: !!updateLesson,
      deleteLesson: !!deleteLesson,
      getLesson: !!getLesson,
      getLessonsByTopic: !!getLessonsByTopic,
      bulkCreateLessons: !!bulkCreateLessons
    },
    fallbacks: {
      addLesson: 'Available',
      updateLesson: 'Available', 
      deleteLesson: 'Available',
      getLesson: 'Available'
    },
    endpoints: [
      'GET /api/lessons - Get all lessons',
      'POST /api/lessons - Create lesson (MAIN ENDPOINT)',
      'GET /api/lessons/:id - Get specific lesson',
      'PUT /api/lessons/:id - Update lesson',
      'DELETE /api/lessons/:id - Delete lesson',
      'GET /api/lessons/test - This test endpoint',
      'GET /api/lessons/stats - Lesson statistics',
      'GET /api/lessons/search - Search lessons'
    ]
  });
});

// ✅ CRITICAL: Ensure proper module export
module.exports = router;