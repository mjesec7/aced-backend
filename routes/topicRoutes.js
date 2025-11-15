const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Topic = require('../models/topic'); // Assuming Topic model is updated to use 'name: String'
const Lesson = require('../models/lesson');

// ✅ Enhanced ObjectId validation
function validateObjectId(req, res, next) {
  const { id, topicId } = req.params;
  const idToValidate = id || topicId;
  
  
  if (idToValidate) {
    // ✅ CRITICAL FIX: More robust ObjectId validation
    if (!mongoose.Types.ObjectId.isValid(idToValidate)) {
      return res.status(400).json({ 
        success: false,
        exists: false,
        message: '❌ Invalid ID format',
        error: 'INVALID_OBJECT_ID',
        providedId: idToValidate
      });
    }
    
    // ✅ Additional check for proper ObjectId length and format
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
  if (req.body && Object.keys(req.body).length > 0) {
  }
  next();
}

// ✅ NEW ENDPOINT: Get topics grouped by subject and level (School Mode)
router.get('/grouped', logRequest, async (req, res) => {
  try {
    console.log('📚 Fetching topics grouped by subject and level (School Mode)');

    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ Database not connected for grouped topics');
      return res.status(503).json({
        success: false,
        message: '❌ Database connection unavailable',
        error: 'DATABASE_NOT_CONNECTED'
      });
    }

    const topics = await Topic.find({ isActive: true })
      .sort({ subject: 1, level: 1, order: 1 })
      .lean();

    console.log(`✅ Found ${topics.length} active topics`);

    // Group by subject, then by level
    const grouped = topics.reduce((acc, topic) => {
      const subject = topic.subject || 'Uncategorized';
      const level = topic.level || 1;

      if (!acc[subject]) {
        acc[subject] = {};
      }

      if (!acc[subject][level]) {
        acc[subject][level] = [];
      }

      acc[subject][level].push({
        _id: topic._id,
        name: topic.name || topic.topicName,
        description: topic.description || '',
        lessonCount: 0 // Will be populated
      });

      return acc;
    }, {});

    // Count lessons for each topic
    for (const subject in grouped) {
      for (const level in grouped[subject]) {
        for (const topic of grouped[subject][level]) {
          const lessonCount = await Lesson.countDocuments({
            topicId: topic._id
          });
          topic.lessonCount = lessonCount;
        }
      }
    }

    console.log(`✅ Grouped topics by ${Object.keys(grouped).length} subjects`);

    res.json({
      success: true,
      data: grouped,
      mode: 'school'
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

// ✅ NEW ENDPOINT: Get topics as flat course cards (Study Centre Mode)
router.get('/as-courses', logRequest, async (req, res) => {
  try {
    const { search, subject, level } = req.query;

    console.log('🎓 Fetching topics as course cards (Study Centre Mode)', { search, subject, level });

    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ Database not connected for course cards');
      return res.status(503).json({
        success: false,
        message: '❌ Database connection unavailable',
        error: 'DATABASE_NOT_CONNECTED'
      });
    }

    const filter = { isActive: true };
    if (subject) filter.subject = subject;
    if (level) filter.level = parseInt(level);

    let topics = await Topic.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ Found ${topics.length} topics matching filters`);

    // Enrich with lesson count and progress
    const enrichedTopics = await Promise.all(
      topics.map(async (topic) => {
        const lessonCount = await Lesson.countDocuments({
          topicId: topic._id
        });

        return {
          _id: topic._id,
          id: topic._id,
          title: topic.name || topic.topicName,
          name: topic.name || topic.topicName,
          description: topic.description || '',
          subject: topic.subject,
          level: topic.level,
          lessonCount: lessonCount,
          type: topic.type || 'free',
          thumbnail: `/api/placeholder/course-${topic.subject}.jpg`,
          // Study Centre specific fields
          displayAs: 'course',
          mode: 'study-centre'
        };
      })
    );

    // Filter by search if provided
    let filtered = enrichedTopics;
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = enrichedTopics.filter(t =>
        t.name.toLowerCase().includes(searchLower) ||
        t.description?.toLowerCase().includes(searchLower)
      );
    }

    console.log(`✅ Returning ${filtered.length} course cards`);

    res.json({
      success: true,
      data: filtered,
      total: filtered.length,
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

// ✅ COMPLETELY FIXED: Get topic by ID with comprehensive error handling
router.get('/:id', logRequest, validateObjectId, async (req, res) => {
  const id = req.params.id;
  
  try {
    
    // ✅ CRITICAL FIX: Check database connection first
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
    
    // ✅ CRITICAL FIX: Try multiple search strategies
    let topic = null;
    let searchStrategy = '';
    
    try {
      // Strategy 1: Direct ObjectId search
                topic = await Topic.findById(id);
      if (topic) {
        searchStrategy = 'direct_objectid';
      }
    } catch (objectIdError) {
    }
    
    // Strategy 2: Manual ObjectId construction and search
    if (!topic) {
      try {
        const objectId = new mongoose.Types.ObjectId(id);
        topic = await Topic.findOne({ _id: objectId });
        if (topic) {
          searchStrategy = 'manual_objectid';
        }
      } catch (manualError) {
      }
    }
    
    // Strategy 3: Search by string representation (updated for 'name' field)
    if (!topic) {
      try {
        topic = await Topic.findOne({ 
          $or: [
            { _id: id },
            { name: id }, // Changed from 'name.en'
            { topicName: id }
          ]
        });
        if (topic) {
          searchStrategy = 'string_search';
        }
      } catch (stringError) {
      }
    }
    
    // Strategy 4: Case-insensitive search (updated for 'name' field)
    if (!topic) {
      try {
        topic = await Topic.findOne({ 
          $or: [
            { name: { $regex: new RegExp(`^${id}$`, 'i') } }, // Changed from 'name.en'
            { topicName: { $regex: new RegExp(`^${id}$`, 'i') } }
          ]
        });
        if (topic) {
          searchStrategy = 'case_insensitive_search';
        }
      } catch (caseError) {
      }
    }
    
    // ✅ CRITICAL DEBUG: If still not found, check what's actually in the database
    if (!topic) {
      
      try {
        // Get sample topics to see the data structure
        const sampleTopics = await Topic.find().limit(5).lean();
        
        
        // Try to find by exact ObjectId string match
        const exactMatch = await Topic.findOne({ 
          _id: { $eq: id }
        });
        
        // Check if the ID exists as a string in the collection
        const stringMatch = await Topic.findOne({
          $or: [
            { _id: id },
            { 'name': id },
            { 'topicName': id }
          ]
        });
        
      } catch (debugError) {
        console.error(`❌ Debug search failed:`, debugError.message);
      }
    }
    
    // ✅ If topic still not found, return comprehensive 404
    if (!topic) {
      
      return res.status(404).json({ 
        success: false,
        exists: false,
        message: '❌ Topic not found',
        error: 'TOPIC_NOT_FOUND',
        requestedId: id,
        searchStrategies: [
          'direct_objectid',
          'manual_objectid',
          'string_search',
          'case_insensitive_search'
        ],
        suggestion: 'Please verify the topic ID is correct and the topic exists',
        debug: {
          idLength: id.length,
          isValidObjectId: mongoose.Types.ObjectId.isValid(id),
          idFormat: /^[0-9a-fA-F]{24}$/.test(id),
          dbConnected: mongoose.connection.readyState === 1
        }
      });
    }

    
    // ✅ CRITICAL: Fetch associated lessons with better error handling
    let lessons = [];
    let lessonError = null;
    let lessonSearchStrategy = '';
    
    try {
      
      // Try multiple lesson search strategies
      
      // Strategy 1: Direct topicId match
      lessons = await Lesson.find({ topicId: topic._id }).sort({ order: 1, createdAt: 1 });
      if (lessons.length > 0) {
        lessonSearchStrategy = 'direct_topicId';
      } else {
        
        // Strategy 2: String-based topic ID match
        lessons = await Lesson.find({ topicId: id }).sort({ order: 1, createdAt: 1 });
        if (lessons.length > 0) {
          lessonSearchStrategy = 'string_topicId';
        } else {
          
          // Strategy 3: Topic name match (updated for 'name' field)
          lessons = await Lesson.find({ topic: topic.name }).sort({ order: 1, createdAt: 1 });
          if (lessons.length > 0) {
            lessonSearchStrategy = 'topic_name';
          } else {
            
            // Strategy 4: Check all lessons and match manually
            const allLessons = await Lesson.find().lean();
            lessons = allLessons.filter(lesson => {
              return lesson.topicId?.toString() === topic._id.toString() ||
                     lesson.topicId?.toString() === id ||
                     lesson.topic === topic.name ||
                     lesson.topic === id;
            });
            
            if (lessons.length > 0) {
              lessonSearchStrategy = 'manual_filter';
            } else {
            }
          }
        }
      }
      
    } catch (lessonErr) {
      console.error(`⚠️ Error fetching lessons for topic ${id}:`, lessonErr.message);
      lessonError = lessonErr.message;
      lessons = [];
    }

    // ✅ CRITICAL: Inject topicId into each lesson for frontend use
    const lessonsWithTopicId = lessons.map(lesson => ({
      ...lesson.toObject ? lesson.toObject() : lesson,
      topicId: topic._id
    }));

    // ✅ CONSISTENT: Return standardized response structure with enhanced debug info
    const response = {
      success: true,
      exists: true,
      message: '✅ Topic loaded successfully',
      data: {
        // ✅ Ensure topic has all necessary fields with fallbacks
        _id: topic._id,
        id: topic._id,
        name: topic.name || topic.topicName, // Changed from topic.name?.en
        topicName: topic.name || topic.topicName, // Changed from topic.name?.en
        subject: topic.subject,
        level: topic.level,
        description: topic.description || '',
        createdAt: topic.createdAt,
        updatedAt: topic.updatedAt,
        
        // Lesson information
        lessons: lessonsWithTopicId,
        lessonsCount: lessons.length,
        lessonError: lessonError
      },
      meta: {
        topicId: id,
        actualTopicId: topic._id,
        searchStrategy: searchStrategy,
        lessonSearchStrategy: lessonSearchStrategy,
        lessonsFound: lessons.length,
        hasLessonError: !!lessonError
      }
    };

    res.json(response);
    
  } catch (err) {
    console.error(`❌ Error fetching topic ${id}:`, err.message);
    console.error('📍 Stack trace:', err.stack);
    
    // ✅ Enhanced error handling
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
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false,
        exists: false,
        message: '❌ Topic validation error',
        error: 'VALIDATION_ERROR',
        requestedId: id,
        details: err.message
      });
    }
    
    // Database connection errors
    if (err.message.includes('connection') || err.code === 'ENOTFOUND') {
      return res.status(503).json({ 
        success: false,
        exists: false,
        message: '❌ Database connection error',
        error: 'DATABASE_CONNECTION_ERROR',
        requestedId: id,
        details: 'Unable to connect to the database'
      });
    }
    
    // Generic server error
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

// ✅ FIXED: Get all topics with enhanced error handling
router.get('/', logRequest, async (req, res) => {
  try {
    
    // Check database connection
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
    console.error('📍 Stack trace:', err.stack);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error while fetching topics',
      error: 'DATABASE_ERROR',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// ✅ Enhanced health check with database testing
router.get('/health/check', async (req, res) => {
  try {
          
    // Test database connection
    const dbConnected = mongoose.connection.readyState === 1;
    let topicCount = 0;
    let lessonCount = 0;
    let dbError = null;
    
    if (dbConnected) {
      try {
        topicCount = await Topic.countDocuments();
        lessonCount = await Lesson.countDocuments();
        
        // Test actual query
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
      },
      endpoints: {
        'GET /topics': 'List all topics',
        'GET /topics/:id': 'Get topic by ID',
        'GET /topics/:id/lessons': 'Get lessons for topic',
        'POST /topics': 'Create new topic',
        'PUT /topics/:id': 'Update topic',
        'DELETE /topics/:id': 'Delete topic'
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

// Keep other existing routes unchanged
router.post('/', logRequest, async (req, res) => {
  const { subject, level, name, description } = req.body;

  // ✅ MODIFIED: Changed validation to check for 'name' directly
  if (!subject || !level || !name) { 
    return res.status(400).json({ 
      success: false,
      message: '❌ Required fields missing: subject, level, name', // Updated error message
      error: 'VALIDATION_ERROR'
    });
  }

  try {
    // ✅ MODIFIED: Changed duplicate check to use 'name' directly
    const duplicate = await Topic.findOne({ 
      subject, 
      level, 
      name: name // Changed from 'name.en': name.en
    });
    
    if (duplicate) {
      return res.status(409).json({ 
        success: false,
        message: '⚠️ Topic with this name already exists',
        error: 'DUPLICATE_TOPIC'
      });
    }

    // Assuming 'name' is now a direct string in the Topic model
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
    (`🔍 Checking if topic exists: ${id}`);
    
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
    
    // ✅ MODIFIED: Changed console log to use 'topic.name'

    res.json({
      success: true,
      message: '✅ Topic and associated lessons deleted successfully',
      deletedTopic: {
        id: id,
        name: topic.name // Changed from topic.name.en
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

    // ✅ MODIFIED: Changed console log to use 'topic.name'
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