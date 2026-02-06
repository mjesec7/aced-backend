const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Topic = require('../models/topic');
const Lesson = require('../models/lesson');
const UserProgress = require('../models/userProgress');

// ✅ Enhanced ObjectId validation
function validateObjectId(req, res, next) {
  const { id, topicId } = req.params;
  const idToValidate = id || topicId;

  if (idToValidate) {
    if (!mongoose.Types.ObjectId.isValid(idToValidate)) {
      return res.status(400).json({
        success: false,
        exists: false,
        message: '❌ Invalid ID format',
        error: 'INVALID_OBJECT_ID',
        providedId: idToValidate
      });
    }

    if (idToValidate.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(idToValidate)) {
      return res.status(400).json({
        success: false,
        exists: false,
        message: '❌ Invalid ObjectId format - must be 24 hex characters',
        error: 'INVALID_OBJECT_ID_FORMAT',
        providedId: idToValidate,
        expectedFormat: '24 hexadecimal characters'
      });
    }
  }

  next();
}

// ✅ Enhanced logging middleware
function logRequest(req, res, next) {
  next();
}

// ✅ FIXED: Get topics grouped by subject and level (School Mode) WITH PROGRESS
router.get('/grouped', logRequest, async (req, res) => {
  try {
    const { userId } = req.query; // Accept userId for progress tracking

    if (mongoose.connection.readyState !== 1) {
      console.error('❌ Database not connected for grouped topics');
      return res.status(503).json({
        success: false,
        message: '❌ Database connection unavailable',
        error: 'DATABASE_NOT_CONNECTED'
      });
    }

    // ✅ Validate Lesson model availability
    if (!Lesson) {
      console.error('❌ Lesson model not available');
      return res.status(500).json({
        success: false,
        error: 'Lesson model not initialized',
        message: 'Internal server error: Models not loaded'
      });
    }

    // Get all active lessons (not topics!)
    let lessons = await Lesson.find({ isActive: true })
      .sort({ subject: 1, level: 1, createdAt: 1 })
      .lean();

    // ✅ DIAGNOSTIC: If no active lessons found, check total count
    if (lessons.length === 0) {
      const totalLessons = await Lesson.countDocuments({});
      const inactiveLessons = await Lesson.countDocuments({ isActive: false });
      console.warn(`⚠️ No active lessons found! Total lessons in DB: ${totalLessons}, Inactive: ${inactiveLessons}`);

      // If there are lessons but all are inactive, return helpful message
      if (totalLessons > 0) {
        console.warn('⚠️ All lessons have isActive: false - consider activating some lessons');
      }
    }

    // ✅ NEW: Get user progress if userId provided
    let userProgressMap = new Map();
    if (userId) {
      try {
        const userProgress = await UserProgress.find({ userId }).lean();
        userProgress.forEach(progress => {
          if (progress.lessonId) {
            userProgressMap.set(progress.lessonId.toString(), progress);
          }
        });
      } catch (progressError) {
        console.warn('⚠️ Could not fetch user progress:', progressError.message);
      }
    }

    // Group lessons by topic to create topic cards
    const topicsMap = new Map();

    lessons.forEach((lesson, index) => {
      const topicId = lesson.topicId?.toString() || lesson.topic || 'uncategorized';

      // Extract topic name from various possible fields
      const topicName = lesson.topicName || lesson.topic || lesson.lessonName || 'Untitled Topic';

      if (!topicsMap.has(topicId)) {
        topicsMap.set(topicId, {
          topicId: topicId,
          _id: topicId,
          name: topicName,
          subject: lesson.subject || 'Uncategorized',
          level: lesson.level || 1,
          type: lesson.type || 'free',
          lessonCount: 0,
          completedLessons: 0,
          totalTime: 0,
          totalPoints: 0,
          totalStars: 0,
          lessons: [],
          lessonIds: []
        });
      }

      const topic = topicsMap.get(topicId);
      topic.lessonCount++;
      topic.totalTime += lesson.estimatedTime || lesson.timing?.estimatedDuration || 10;
      topic.lessons.push(lesson);
      topic.lessonIds.push(lesson._id.toString());

      // ✅ NEW: Track progress for this lesson
      if (userId) {
        const lessonProgress = userProgressMap.get(lesson._id.toString());
        if (lessonProgress?.completed) {
          topic.completedLessons++;
          topic.totalPoints += lessonProgress.points || 0;
          topic.totalStars += lessonProgress.stars || 0;
        }
      }
    });

    // Convert to array and group by subject and level
    const topicsArray = Array.from(topicsMap.values());

    const grouped = topicsArray.reduce((acc, topic) => {
      const subject = topic.subject || 'Uncategorized';
      const level = topic.level || 1;

      if (!acc[subject]) {
        acc[subject] = {};
      }

      if (!acc[subject][level]) {
        acc[subject][level] = [];
      }

      // ✅ Calculate progress percentage
      const progressPercent = topic.lessonCount > 0
        ? Math.round((topic.completedLessons / topic.lessonCount) * 100)
        : 0;

      acc[subject][level].push({
        _id: topic.topicId,
        topicId: topic.topicId,
        name: topic.name,
        description: `Course with ${topic.lessonCount} lessons`,
        subject: topic.subject,
        level: topic.level,
        lessonCount: topic.lessonCount,
        totalTime: topic.totalTime,
        type: topic.type,
        // ✅ NEW: Progress fields
        progress: {
          completedLessons: topic.completedLessons,
          totalLessons: topic.lessonCount,
          progressPercent: progressPercent,
          totalPoints: topic.totalPoints,
          totalStars: topic.totalStars,
          isCompleted: topic.completedLessons === topic.lessonCount && topic.lessonCount > 0,
          isStarted: topic.completedLessons > 0
        },
        // Shorthand progress fields for easier access
        progressPercent: progressPercent,
        completedLessons: topic.completedLessons,
        isCompleted: topic.completedLessons === topic.lessonCount && topic.lessonCount > 0
      });

      return acc;
    }, {});

    res.json({
      success: true,
      data: grouped,
      mode: 'school',
      totalTopics: topicsArray.length,
      totalLessons: lessons.length,
      hasProgressData: !!userId
    });
  } catch (error) {
    console.error('❌ Error grouping topics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch grouped topics',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ✅ FIXED: Get topics as flat course cards (Study Centre Mode) WITH PROGRESS
router.get('/as-courses', logRequest, async (req, res) => {
  try {
    const { search, subject, level, userId } = req.query; // ✅ Accept userId

    if (mongoose.connection.readyState !== 1) {
      console.error('❌ Database not connected for course cards');
      return res.status(503).json({
        success: false,
        message: '❌ Database connection unavailable',
        error: 'DATABASE_NOT_CONNECTED'
      });
    }

    // ✅ Validate Lesson model availability
    if (!Lesson) {
      console.error('❌ Lesson model not available');
      return res.status(500).json({
        success: false,
        error: 'Lesson model not initialized',
        message: 'Internal server error: Models not loaded'
      });
    }

    // Build filter for lessons
    const filter = { isActive: true };
    if (subject) filter.subject = subject;
    if (level) filter.level = parseInt(level);

    // Get all matching lessons
    let lessons = await Lesson.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    // ✅ DIAGNOSTIC: If no lessons found, check total count
    if (lessons.length === 0) {
      const totalLessons = await Lesson.countDocuments({});
      const activeLessons = await Lesson.countDocuments({ isActive: true });
      console.warn(`⚠️ No lessons matching filter! Total in DB: ${totalLessons}, Active: ${activeLessons}`);
      console.warn(`⚠️ Applied filter:`, JSON.stringify(filter));

      if (totalLessons > 0 && activeLessons === 0) {
        console.warn('⚠️ All lessons have isActive: false - consider activating some lessons');
      }
    }

    // ✅ NEW: Get user progress if userId provided
    let userProgressMap = new Map();
    if (userId) {
      try {
        const userProgress = await UserProgress.find({ userId }).lean();
        userProgress.forEach(progress => {
          if (progress.lessonId) {
            userProgressMap.set(progress.lessonId.toString(), progress);
          }
        });
      } catch (progressError) {
        console.warn('⚠️ Could not fetch user progress:', progressError.message);
      }
    }

    // Group lessons by topic to create course cards
    const topicsMap = new Map();

    lessons.forEach((lesson, index) => {
      const topicId = lesson.topicId?.toString() || lesson.topic || 'uncategorized';

      // Extract topic name from various possible fields
      const topicName = lesson.topicName || lesson.topic || lesson.lessonName || 'Untitled Topic';

      if (!topicsMap.has(topicId)) {
        topicsMap.set(topicId, {
          _id: topicId,
          topicId: topicId,
          id: topicId,
          name: topicName,
          title: topicName,
          description: `Course with lessons on ${topicName}`,
          subject: lesson.subject || 'Uncategorized',
          level: lesson.level || 1,
          type: lesson.type || 'free',
          lessonCount: 0,
          completedLessons: 0,
          totalTime: 0,
          totalPoints: 0,
          totalStars: 0,
          thumbnail: `/api/placeholder/course-${lesson.subject || 'general'}.jpg`,
          displayAs: 'course',
          mode: 'study-centre',
          lessonIds: []
        });
      }

      const topic = topicsMap.get(topicId);
      topic.lessonCount++;
      topic.totalTime += lesson.estimatedTime || lesson.timing?.estimatedDuration || 10;
      topic.lessonIds.push(lesson._id.toString());

      // ✅ NEW: Track progress for this lesson
      if (userId) {
        const lessonProgress = userProgressMap.get(lesson._id.toString());
        if (lessonProgress?.completed) {
          topic.completedLessons++;
          topic.totalPoints += lessonProgress.points || 0;
          topic.totalStars += lessonProgress.stars || 0;
        }
      }
    });

    // Convert to array and add progress data
    let enrichedTopics = Array.from(topicsMap.values()).map(topic => {
      const progressPercent = topic.lessonCount > 0
        ? Math.round((topic.completedLessons / topic.lessonCount) * 100)
        : 0;

      return {
        ...topic,
        // ✅ NEW: Progress fields
        progress: {
          completedLessons: topic.completedLessons,
          totalLessons: topic.lessonCount,
          progressPercent: progressPercent,
          totalPoints: topic.totalPoints,
          totalStars: topic.totalStars,
          isCompleted: topic.completedLessons === topic.lessonCount && topic.lessonCount > 0,
          isStarted: topic.completedLessons > 0
        },
        // Shorthand progress fields for easier access
        progressPercent: progressPercent,
        completedLessons: topic.completedLessons,
        isCompleted: topic.completedLessons === topic.lessonCount && topic.lessonCount > 0,
        isStarted: topic.completedLessons > 0
      };
    });

    // Filter by search if provided
    if (search) {
      const searchLower = search.toLowerCase();
      enrichedTopics = enrichedTopics.filter(t =>
        t.name.toLowerCase().includes(searchLower) ||
        t.description?.toLowerCase().includes(searchLower) ||
        t.subject?.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      data: enrichedTopics,
      courses: enrichedTopics, // Also add as 'courses' for compatibility
      total: enrichedTopics.length,
      mode: 'study-centre',
      hasProgressData: !!userId
    });
  } catch (error) {
    console.error('❌ Error fetching course cards:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch courses',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ✅ FIXED: Get topic by ID with comprehensive error handling AND PROGRESS
router.get('/:id', logRequest, validateObjectId, async (req, res) => {
  const id = req.params.id;
  const { userId } = req.query; // ✅ Accept userId for progress

  try {
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ Database not connected, state:', mongoose.connection.readyState);
      return res.status(503).json({
        success: false,
        exists: false,
        message: '❌ Database connection unavailable',
        error: 'DATABASE_NOT_CONNECTED',
        dbState: mongoose.connection.readyState
      });
    }

    // Strategy 1: Try to find actual Topic document
    let topic = null;
    let searchStrategy = '';

    try {
      topic = await Topic.findById(id);
      if (topic) {
        searchStrategy = 'direct_topic';
      }
    } catch (topicError) {
      // Topic not found in Topics collection, searching lessons...
    }

    // Strategy 2: Build topic from lessons (PRIMARY STRATEGY)
    if (!topic) {
      try {
        // Find all lessons that match this topicId
        const lessons = await Lesson.find({
          $or: [
            { topicId: id },
            { topic: id },
            { topicName: id }
          ]
        }).sort({ order: 1, createdAt: 1 });

        if (lessons.length > 0) {
          const firstLesson = lessons[0];

          // Extract topic name from various possible fields
          const topicName = firstLesson.topicName || firstLesson.topic || firstLesson.lessonName || 'Untitled Topic';

          // Build topic from lessons
          topic = {
            _id: id,
            id: id,
            name: topicName,
            topicName: topicName,
            subject: firstLesson.subject,
            level: firstLesson.level,
            description: `Course with ${lessons.length} lessons on ${topicName}`,
            lessonCount: lessons.length,
            totalTime: lessons.reduce((sum, l) => sum + (l.estimatedTime || l.timing?.estimatedDuration || 10), 0),
            type: firstLesson.type || 'free',
            lessons: lessons,
            isConstructed: true
          };

          searchStrategy = 'constructed_from_lessons';
        }
      } catch (lessonError) {
        console.error('❌ Error searching lessons:', lessonError);
      }
    }

    // If still not found, return 404
    if (!topic) {
      return res.status(404).json({
        success: false,
        exists: false,
        message: '❌ Topic not found',
        error: 'TOPIC_NOT_FOUND',
        requestedId: id,
        searchStrategies: [
          'direct_topic',
          'constructed_from_lessons'
        ],
        suggestion: 'Please verify the topic ID is correct and the topic has lessons',
        debug: {
          idLength: id.length,
          isValidObjectId: mongoose.Types.ObjectId.isValid(id),
          idFormat: /^[0-9a-fA-F]{24}$/.test(id),
          dbConnected: mongoose.connection.readyState === 1
        }
      });
    }

    // Get lessons for the topic if not already included
    let lessons = topic.lessons || [];
    if (!lessons.length) {
      try {
        lessons = await Lesson.find({
          $or: [
            { topicId: topic._id },
            { topic: topic.name },
            { topicName: topic.name }
          ]
        }).sort({ order: 1, createdAt: 1 });
      } catch (lessonErr) {
        console.error(`⚠️ Error fetching lessons for topic ${id}:`, lessonErr.message);
        lessons = [];
      }
    }

    // ✅ NEW: Get user progress if userId provided
    let userProgressMap = new Map();
    let completedLessons = 0;
    let totalPoints = 0;
    let totalStars = 0;

    if (userId) {
      try {
        const lessonIds = lessons.map(l => l._id || l.id);
        const userProgress = await UserProgress.find({
          userId,
          lessonId: { $in: lessonIds }
        }).lean();

        userProgress.forEach(progress => {
          if (progress.lessonId) {
            userProgressMap.set(progress.lessonId.toString(), progress);
            if (progress.completed) {
              completedLessons++;
              totalPoints += progress.points || 0;
              totalStars += progress.stars || 0;
            }
          }
        });
      } catch (progressError) {
        console.warn('⚠️ Could not fetch user progress:', progressError.message);
      }
    }

    // Inject topicId AND progress into each lesson for frontend use
    const lessonsWithTopicId = lessons.map(lesson => {
      const lessonObj = lesson.toObject ? lesson.toObject() : lesson;
      const lessonId = (lesson._id || lesson.id).toString();
      const lessonProgress = userProgressMap.get(lessonId);

      return {
        ...lessonObj,
        topicId: topic._id || topic.id,
        // ✅ NEW: Per-lesson progress
        progress: lessonProgress ? {
          completed: lessonProgress.completed || false,
          progressPercent: lessonProgress.progressPercent || 0,
          stars: lessonProgress.stars || 0,
          points: lessonProgress.points || 0,
          completedSteps: lessonProgress.completedSteps || [],
          totalSteps: lessonProgress.totalSteps || 0,
          lastAccessed: lessonProgress.lastAccessedAt
        } : null,
        isCompleted: lessonProgress?.completed || false,
        userStars: lessonProgress?.stars || 0
      };
    });

    // ✅ Calculate topic-level progress
    const progressPercent = lessons.length > 0
      ? Math.round((completedLessons / lessons.length) * 100)
      : 0;

    // Build response
    const response = {
      success: true,
      exists: true,
      message: '✅ Topic loaded successfully',
      data: {
        _id: topic._id || topic.id,
        id: topic._id || topic.id,
        topicId: topic._id || topic.id,
        name: topic.name || topic.topicName,
        topicName: topic.name || topic.topicName,
        subject: topic.subject,
        level: topic.level,
        description: topic.description || '',
        lessonCount: lessons.length,
        totalTime: topic.totalTime || lessons.reduce((sum, l) => sum + (l.estimatedTime || 10), 0),
        type: topic.type || 'free',
        createdAt: topic.createdAt,
        updatedAt: topic.updatedAt,
        lessons: lessonsWithTopicId,
        lessonsCount: lessons.length,
        // ✅ NEW: Topic-level progress
        progress: {
          completedLessons: completedLessons,
          totalLessons: lessons.length,
          progressPercent: progressPercent,
          totalPoints: totalPoints,
          totalStars: totalStars,
          isCompleted: completedLessons === lessons.length && lessons.length > 0,
          isStarted: completedLessons > 0
        },
        progressPercent: progressPercent,
        completedLessons: completedLessons,
        isCompleted: completedLessons === lessons.length && lessons.length > 0
      },
      meta: {
        topicId: id,
        actualTopicId: topic._id || topic.id,
        searchStrategy: searchStrategy,
        lessonsFound: lessons.length,
        isConstructed: topic.isConstructed || false,
        hasProgressData: !!userId
      }
    };

    res.json(response);

  } catch (err) {
    console.error(`❌ Error fetching topic ${id}:`, err.message);
    console.error('📍 Stack trace:', err.stack);

    if (err.name === 'CastError') {
      return res.status(400).json({
        success: false,
        exists: false,
        message: '❌ Invalid topic ID format',
        error: 'INVALID_OBJECT_ID',
        requestedId: id,
        details: 'The provided ID is not a valid MongoDB ObjectId format'
      });
    }

    res.status(500).json({
      success: false,
      exists: false,
      message: '❌ Server error while fetching topic data',
      error: 'DATABASE_ERROR',
      requestedId: id,
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// ✅ NEW: Get progress summary for all topics for a user (for analytics/dashboard)
router.get('/user/:userId/progress', logRequest, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'DATABASE_NOT_CONNECTED'
      });
    }

    // Get all active lessons grouped by topic
    const lessons = await Lesson.find({ isActive: true }).lean();

    // Build topic map
    const topicsMap = new Map();
    lessons.forEach(lesson => {
      const topicId = lesson.topicId?.toString() || lesson.topic || 'uncategorized';
      const topicName = lesson.topicName || lesson.topic || lesson.lessonName || 'Untitled Topic';

      if (!topicsMap.has(topicId)) {
        topicsMap.set(topicId, {
          topicId,
          name: topicName,
          subject: lesson.subject || 'Uncategorized',
          level: lesson.level || 1,
          lessonCount: 0,
          lessonIds: []
        });
      }

      topicsMap.get(topicId).lessonCount++;
      topicsMap.get(topicId).lessonIds.push(lesson._id.toString());
    });

    // Get user progress
    const userProgress = await UserProgress.find({ userId }).lean();
    const progressMap = new Map();
    userProgress.forEach(p => {
      if (p.lessonId) {
        progressMap.set(p.lessonId.toString(), p);
      }
    });

    // Calculate progress for each topic
    const topicsProgress = [];
    let totalCompleted = 0;
    let totalLessons = 0;
    let overallPoints = 0;
    let overallStars = 0;

    for (const [topicId, topic] of topicsMap) {
      let completedLessons = 0;
      let topicPoints = 0;
      let topicStars = 0;

      topic.lessonIds.forEach(lessonId => {
        const progress = progressMap.get(lessonId);
        if (progress?.completed) {
          completedLessons++;
          topicPoints += progress.points || 0;
          topicStars += progress.stars || 0;
        }
      });

      const progressPercent = topic.lessonCount > 0
        ? Math.round((completedLessons / topic.lessonCount) * 100)
        : 0;

      topicsProgress.push({
        topicId,
        name: topic.name,
        subject: topic.subject,
        level: topic.level,
        completedLessons,
        totalLessons: topic.lessonCount,
        progressPercent,
        totalPoints: topicPoints,
        totalStars: topicStars,
        isCompleted: completedLessons === topic.lessonCount && topic.lessonCount > 0,
        isStarted: completedLessons > 0
      });

      totalCompleted += completedLessons;
      totalLessons += topic.lessonCount;
      overallPoints += topicPoints;
      overallStars += topicStars;
    }

    // Sort by progress (in progress first, then not started)
    topicsProgress.sort((a, b) => {
      if (a.isStarted && !a.isCompleted && (!b.isStarted || b.isCompleted)) return -1;
      if (b.isStarted && !b.isCompleted && (!a.isStarted || a.isCompleted)) return 1;
      return b.progressPercent - a.progressPercent;
    });

    res.json({
      success: true,
      data: {
        topics: topicsProgress,
        summary: {
          totalTopics: topicsProgress.length,
          completedTopics: topicsProgress.filter(t => t.isCompleted).length,
          inProgressTopics: topicsProgress.filter(t => t.isStarted && !t.isCompleted).length,
          totalLessons,
          completedLessons: totalCompleted,
          overallProgressPercent: totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0,
          totalPoints: overallPoints,
          totalStars: overallStars
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching user topic progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch progress',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Keep all other existing routes unchanged...
router.get('/', logRequest, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ Database not connected for topics list');
      return res.status(503).json({
        success: false,
        message: '❌ Database connection unavailable',
        error: 'DATABASE_NOT_CONNECTED'
      });
    }

    const topics = await Topic.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      count: topics.length,
      data: topics
    });
  } catch (err) {
    console.error('❌ Failed to fetch topics:', err.message);
    res.status(500).json({
      success: false,
      message: '❌ Server error while fetching topics',
      error: 'DATABASE_ERROR',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

router.get('/health/check', async (req, res) => {
  try {
    const dbConnected = mongoose.connection.readyState === 1;
    let topicCount = 0;
    let lessonCount = 0;
    let dbError = null;

    if (dbConnected) {
      try {
        topicCount = await Topic.countDocuments();
        lessonCount = await Lesson.countDocuments();
        await Topic.findOne();
      } catch (queryError) {
        dbError = queryError.message;
        console.error('❌ Database query test failed:', queryError);
      }
    }

    const healthStatus = {
      success: true,
      message: dbConnected && !dbError ? '✅ Topic routes are healthy' : '⚠️ Issues detected',
      database: {
        connected: dbConnected,
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        name: mongoose.connection.name,
        error: dbError
      },
      stats: {
        topics: topicCount,
        lessons: lessonCount,
        timestamp: new Date().toISOString()
      }
    };

    const statusCode = dbConnected && !dbError ? 200 : 503;
    res.status(statusCode).json(healthStatus);

  } catch (err) {
    console.error('❌ Health check failed:', err.message);
    res.status(500).json({
      success: false,
      message: '❌ Health check failed',
      error: 'HEALTH_CHECK_ERROR',
      details: err.message
    });
  }
});

// Keep all other routes (POST, PUT, DELETE) unchanged...
router.post('/', logRequest, async (req, res) => {
  const { subject, level, name, description } = req.body;

  if (!subject || !level || !name) {
    return res.status(400).json({
      success: false,
      message: '❌ Required fields missing: subject, level, name',
      error: 'VALIDATION_ERROR'
    });
  }

  try {
    const duplicate = await Topic.findOne({ subject, level, name });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: '⚠️ Topic with this name already exists',
        error: 'DUPLICATE_TOPIC'
      });
    }

    const newTopic = new Topic({ subject, level, name, description });
    const saved = await newTopic.save();

    res.status(201).json({
      success: true,
      message: '✅ Topic created successfully',
      data: saved
    });
  } catch (err) {
    console.error('❌ Failed to create topic:', err.message);
    res.status(500).json({
      success: false,
      message: '❌ Server error while creating topic',
      error: 'DATABASE_ERROR'
    });
  }
});

router.get('/:id/lessons', logRequest, validateObjectId, async (req, res) => {
  const id = req.params.id;

  try {
    const topicExists = await Topic.exists({ _id: id });
    if (!topicExists) {
      return res.status(404).json({
        success: false,
        message: '❌ Topic not found',
        error: 'TOPIC_NOT_FOUND'
      });
    }

    const lessons = await Lesson.find({ topicId: id }).sort({ order: 1, createdAt: 1 });

    const lessonsWithTopicId = lessons.map(lesson => ({
      ...lesson.toObject(),
      topicId: id
    }));

    res.json({
      success: true,
      topicId: id,
      count: lessons.length,
      data: lessonsWithTopicId
    });

  } catch (err) {
    console.error(`❌ Error fetching lessons for topic ${id}:`, err.message);
    res.status(500).json({
      success: false,
      message: '❌ Server error while fetching lessons',
      error: 'DATABASE_ERROR'
    });
  }
});

router.delete('/:id', logRequest, validateObjectId, async (req, res) => {
  const id = req.params.id;

  try {
    const topic = await Topic.findById(id);
    if (!topic) {
      return res.status(404).json({
        success: false,
        message: '❌ Topic not found',
        error: 'TOPIC_NOT_FOUND'
      });
    }

    const lessonDeleteResult = await Lesson.deleteMany({ topicId: id });
    await Topic.findByIdAndDelete(id);

    res.json({
      success: true,
      message: '✅ Topic and associated lessons deleted successfully',
      deletedTopic: {
        id: id,
        name: topic.name
      },
      deletedLessonsCount: lessonDeleteResult.deletedCount
    });

  } catch (err) {
    console.error(`❌ Error deleting topic ${id}:`, err.message);
    res.status(500).json({
      success: false,
      message: '❌ Server error while deleting topic',
      error: 'DATABASE_ERROR'
    });
  }
});

router.put('/:id', logRequest, validateObjectId, async (req, res) => {
  const id = req.params.id;
  const updates = req.body;

  try {
    const topic = await Topic.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!topic) {
      return res.status(404).json({
        success: false,
        message: '❌ Topic not found',
        error: 'TOPIC_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: '✅ Topic updated successfully',
      data: topic
    });

  } catch (err) {
    console.error(`❌ Error updating topic ${id}:`, err.message);
    res.status(500).json({
      success: false,
      message: '❌ Server error while updating topic',
      error: 'DATABASE_ERROR'
    });
  }
});

module.exports = router;
