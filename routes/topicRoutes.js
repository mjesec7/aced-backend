const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Topic = require('../models/topic');
const Lesson = require('../models/lesson');

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
  console.log(`📥 ${req.method} ${req.path}`, req.query);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📦 Body:', req.body);
  }
  next();
}

// ✅ FIXED: Get topics grouped by subject and level (School Mode)
router.get('/grouped', logRequest, async (req, res) => {
  try {
    console.log('📚 Fetching topics grouped by subject and level (School Mode)');

    if (mongoose.connection.readyState !== 1) {
      console.error('❌ Database not connected for grouped topics');
      return res.status(503).json({
        success: false,
        message: '❌ Database connection unavailable',
        error: 'DATABASE_NOT_CONNECTED'
      });
    }

    // Get all active lessons (not topics!)
    const lessons = await Lesson.find({ isActive: true })
      .sort({ subject: 1, level: 1, createdAt: 1 })
      .lean();

    console.log(`✅ Found ${lessons.length} active lessons`);

    // Group lessons by topic to create topic cards
    const topicsMap = new Map();

    lessons.forEach(lesson => {
      const topicId = lesson.topicId?.toString() || lesson.topic || 'uncategorized';

      if (!topicsMap.has(topicId)) {
        topicsMap.set(topicId, {
          topicId: topicId,
          _id: topicId,
          name: lesson.topic || 'Untitled Topic',
          subject: lesson.subject || 'Uncategorized',
          level: lesson.level || 1,
          type: lesson.type || 'free',
          lessonCount: 0,
          totalTime: 0,
          lessons: []
        });
      }

      const topic = topicsMap.get(topicId);
      topic.lessonCount++;
      topic.totalTime += lesson.estimatedTime || 10;
      topic.lessons.push(lesson);
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

      acc[subject][level].push({
        _id: topic.topicId,
        topicId: topic.topicId,
        name: topic.name,
        description: `Course with ${topic.lessonCount} lessons`,
        subject: topic.subject,
        level: topic.level,
        lessonCount: topic.lessonCount,
        totalTime: topic.totalTime,
        type: topic.type
      });

      return acc;
    }, {});

    console.log(`✅ Grouped ${topicsArray.length} topics by ${Object.keys(grouped).length} subjects`);

    res.json({
      success: true,
      data: grouped,
      mode: 'school',
      totalTopics: topicsArray.length,
      totalLessons: lessons.length
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

// ✅ FIXED: Get topics as flat course cards (Study Centre Mode)
router.get('/as-courses', logRequest, async (req, res) => {
  try {
    const { search, subject, level } = req.query;

    console.log('🎓 Fetching topics as course cards (Study Centre Mode)', { search, subject, level });

    if (mongoose.connection.readyState !== 1) {
      console.error('❌ Database not connected for course cards');
      return res.status(503).json({
        success: false,
        message: '❌ Database connection unavailable',
        error: 'DATABASE_NOT_CONNECTED'
      });
    }

    // Build filter for lessons
    const filter = { isActive: true };
    if (subject) filter.subject = subject;
    if (level) filter.level = parseInt(level);

    // Get all matching lessons
    const lessons = await Lesson.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${lessons.length} lessons matching filters`);

    // Group lessons by topic to create course cards
    const topicsMap = new Map();

    lessons.forEach(lesson => {
      const topicId = lesson.topicId?.toString() || lesson.topic || 'uncategorized';

      if (!topicsMap.has(topicId)) {
        topicsMap.set(topicId, {
          _id: topicId,
          topicId: topicId,
          id: topicId,
          name: lesson.topic || 'Untitled Topic',
          title: lesson.topic || 'Untitled Topic',
          description: `Course with lessons on ${lesson.topic || 'various topics'}`,
          subject: lesson.subject || 'Uncategorized',
          level: lesson.level || 1,
          type: lesson.type || 'free',
          lessonCount: 0,
          totalTime: 0,
          thumbnail: `/api/placeholder/course-${lesson.subject || 'general'}.jpg`,
          displayAs: 'course',
          mode: 'study-centre'
        });
      }

      const topic = topicsMap.get(topicId);
      topic.lessonCount++;
      topic.totalTime += lesson.estimatedTime || 10;
    });

    // Convert to array
    let enrichedTopics = Array.from(topicsMap.values());

    // Filter by search if provided
    if (search) {
      const searchLower = search.toLowerCase();
      enrichedTopics = enrichedTopics.filter(t =>
        t.name.toLowerCase().includes(searchLower) ||
        t.description?.toLowerCase().includes(searchLower) ||
        t.subject?.toLowerCase().includes(searchLower)
      );
    }

    console.log(`✅ Returning ${enrichedTopics.length} course cards`);

    res.json({
      success: true,
      data: enrichedTopics,
      courses: enrichedTopics, // Also add as 'courses' for compatibility
      total: enrichedTopics.length,
      mode: 'study-centre'
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

// ✅ FIXED: Get topic by ID with comprehensive error handling
router.get('/:id', logRequest, validateObjectId, async (req, res) => {
  const id = req.params.id;

  try {
    console.log(`🔍 Looking up topic/course: ${id}`);

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
        console.log(`✅ Found topic in Topics collection: ${topic.name}`);
      }
    } catch (topicError) {
      console.log('⚠️ Topic not found in Topics collection, searching lessons...');
    }

    // Strategy 2: Build topic from lessons (PRIMARY STRATEGY)
    if (!topic) {
      try {
        // Find all lessons that match this topicId
        const lessons = await Lesson.find({
          $or: [
            { topicId: id },
            { topic: id }
          ]
        }).sort({ order: 1, createdAt: 1 });

        if (lessons.length > 0) {
          const firstLesson = lessons[0];

          // Build topic from lessons
          topic = {
            _id: id,
            id: id,
            name: firstLesson.topic || 'Untitled Topic',
            topicName: firstLesson.topic || 'Untitled Topic',
            subject: firstLesson.subject,
            level: firstLesson.level,
            description: `Course with ${lessons.length} lessons on ${firstLesson.topic || 'various topics'}`,
            lessonCount: lessons.length,
            totalTime: lessons.reduce((sum, l) => sum + (l.estimatedTime || 10), 0),
            type: firstLesson.type || 'free',
            lessons: lessons,
            isConstructed: true
          };

          searchStrategy = 'constructed_from_lessons';
          console.log(`✅ Constructed topic from ${lessons.length} lessons: ${topic.name}`);
        }
      } catch (lessonError) {
        console.error('❌ Error searching lessons:', lessonError);
      }
    }

    // If still not found, return 404
    if (!topic) {
      console.log(`❌ Topic/course not found: ${id}`);
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
            { topic: topic.name }
          ]
        }).sort({ order: 1, createdAt: 1 });

        console.log(`✅ Found ${lessons.length} lessons for topic`);
      } catch (lessonErr) {
        console.error(`⚠️ Error fetching lessons for topic ${id}:`, lessonErr.message);
        lessons = [];
      }
    }

    // Inject topicId into each lesson for frontend use
    const lessonsWithTopicId = lessons.map(lesson => ({
      ...lesson.toObject ? lesson.toObject() : lesson,
      topicId: topic._id || topic.id
    }));

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
        lessonsCount: lessons.length
      },
      meta: {
        topicId: id,
        actualTopicId: topic._id || topic.id,
        searchStrategy: searchStrategy,
        lessonsFound: lessons.length,
        isConstructed: topic.isConstructed || false
      }
    };

    console.log(`✅ Returning topic with ${lessons.length} lessons`);
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

// Keep all other existing routes unchanged...
router.get('/', logRequest, async (req, res) => {
  try {
    console.log('📚 Fetching all topics');

    if (mongoose.connection.readyState !== 1) {
      console.error('❌ Database not connected for topics list');
      return res.status(503).json({
        success: false,
        message: '❌ Database connection unavailable',
        error: 'DATABASE_NOT_CONNECTED'
      });
    }

    const topics = await Topic.find().sort({ createdAt: -1 });

    console.log(`✅ Found ${topics.length} topics`);

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
    console.log(`🔍 Checking if topic exists: ${id}`);

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
