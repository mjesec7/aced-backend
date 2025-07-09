// FIXED topicRoutes.js - Complete solution for 404 topic issues
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Topic = require('../models/topic');
const Lesson = require('../models/lesson');

// ✅ Enhanced ObjectId validation
function validateObjectId(req, res, next) {
  const { id, topicId } = req.params;
  const idToValidate = id || topicId;
  
  console.log(`🔍 Validating ObjectId: ${idToValidate}`);
  
  if (idToValidate) {
    // ✅ CRITICAL FIX: More robust ObjectId validation
    if (!mongoose.Types.ObjectId.isValid(idToValidate)) {
      console.warn(`⚠️ Invalid ObjectId format: ${idToValidate}`);
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
      console.warn(`⚠️ ObjectId wrong format: ${idToValidate}`);
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
  console.log(`📥 [${req.method}] ${req.originalUrl} - ${new Date().toISOString()}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
}

// ✅ COMPLETELY FIXED: Get topic by ID with comprehensive error handling
router.get('/:id', logRequest, validateObjectId, async (req, res) => {
  const id = req.params.id;
  
  try {
    console.log(`🔍 Searching for topic with ID: ${id}`);
    console.log(`📊 MongoDB connection state: ${mongoose.connection.readyState}`);
    
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
      console.log(`🔍 Strategy 1: Searching by ObjectId...`);
      topic = await Topic.findById(id);
      if (topic) {
        searchStrategy = 'direct_objectid';
        console.log(`✅ Found topic by ObjectId: "${topic.name}"`);
      }
    } catch (objectIdError) {
      console.warn(`⚠️ ObjectId search failed:`, objectIdError.message);
    }
    
    // Strategy 2: Manual ObjectId construction and search
    if (!topic) {
      try {
        console.log(`🔍 Strategy 2: Manual ObjectId construction...`);
        const objectId = new mongoose.Types.ObjectId(id);
        topic = await Topic.findOne({ _id: objectId });
        if (topic) {
          searchStrategy = 'manual_objectid';
          console.log(`✅ Found topic by manual ObjectId: "${topic.name}"`);
        }
      } catch (manualError) {
        console.warn(`⚠️ Manual ObjectId search failed:`, manualError.message);
      }
    }
    
    // Strategy 3: Search by string representation
    if (!topic) {
      try {
        console.log(`🔍 Strategy 3: String-based search...`);
        topic = await Topic.findOne({ 
          $or: [
            { _id: id },
            { 'name.en': id },
            { 'name.ru': id },
            { 'name.uz': id },
            { name: id },
            { topicName: id }
          ]
        });
        if (topic) {
          searchStrategy = 'string_search';
          console.log(`✅ Found topic by string search: "${topic.name}"`);
        }
      } catch (stringError) {
        console.warn(`⚠️ String search failed:`, stringError.message);
      }
    }
    
    // Strategy 4: Case-insensitive search
    if (!topic) {
      try {
        console.log(`🔍 Strategy 4: Case-insensitive search...`);
        topic = await Topic.findOne({ 
          $or: [
            { 'name.en': { $regex: new RegExp(`^${id}$`, 'i') } },
            { 'name.ru': { $regex: new RegExp(`^${id}$`, 'i') } },
            { 'name.uz': { $regex: new RegExp(`^${id}$`, 'i') } },
            { name: { $regex: new RegExp(`^${id}$`, 'i') } },
            { topicName: { $regex: new RegExp(`^${id}$`, 'i') } }
          ]
        });
        if (topic) {
          searchStrategy = 'case_insensitive_search';
          console.log(`✅ Found topic by case-insensitive search: "${topic.name}"`);
        }
      } catch (caseError) {
        console.warn(`⚠️ Case-insensitive search failed:`, caseError.message);
      }
    }
    
    // ✅ CRITICAL DEBUG: If still not found, check what's actually in the database
    if (!topic) {
      console.log(`🔍 Topic not found. Let's check what's in the database...`);
      
      try {
        // Get sample topics to see the data structure
        const sampleTopics = await Topic.find().limit(5).lean();
        console.log(`📋 Sample topics in database:`, sampleTopics.map(t => ({
          _id: t._id,
          name: t.name,
          topicName: t.topicName,
          subject: t.subject,
          level: t.level
        })));
        
        // Try to find by exact ObjectId string match
        const exactMatch = await Topic.findOne({ 
          _id: { $eq: id }
        });
        console.log(`🔍 Exact ObjectId match result:`, exactMatch ? 'FOUND' : 'NOT FOUND');
        
        // Check if the ID exists as a string in the collection
        const stringMatch = await Topic.findOne({
          $or: [
            { _id: id },
            { 'name': id },
            { 'topicName': id }
          ]
        });
        console.log(`🔍 String match result:`, stringMatch ? 'FOUND' : 'NOT FOUND');
        
      } catch (debugError) {
        console.error(`❌ Debug search failed:`, debugError.message);
      }
    }
    
    // ✅ If topic still not found, return comprehensive 404
    if (!topic) {
      console.warn(`⚠️ Topic not found after all search strategies: ${id}`);
      
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

    console.log(`📘 Topic found successfully: "${topic.name}" via ${searchStrategy}`);
    
    // ✅ CRITICAL: Fetch associated lessons with better error handling
    let lessons = [];
    let lessonError = null;
    let lessonSearchStrategy = '';
    
    try {
      console.log(`📚 Fetching lessons for topic ID: ${topic._id}`);
      
      // Try multiple lesson search strategies
      
      // Strategy 1: Direct topicId match
      lessons = await Lesson.find({ topicId: topic._id }).sort({ order: 1, createdAt: 1 });
      if (lessons.length > 0) {
        lessonSearchStrategy = 'direct_topicId';
        console.log(`✅ Found ${lessons.length} lessons via direct topicId match`);
      } else {
        console.log(`⚠️ No lessons found via direct topicId match`);
        
        // Strategy 2: String-based topic ID match
        lessons = await Lesson.find({ topicId: id }).sort({ order: 1, createdAt: 1 });
        if (lessons.length > 0) {
          lessonSearchStrategy = 'string_topicId';
          console.log(`✅ Found ${lessons.length} lessons via string topicId match`);
        } else {
          console.log(`⚠️ No lessons found via string topicId match`);
          
          // Strategy 3: Topic name match
          lessons = await Lesson.find({ topic: topic.name }).sort({ order: 1, createdAt: 1 });
          if (lessons.length > 0) {
            lessonSearchStrategy = 'topic_name';
            console.log(`✅ Found ${lessons.length} lessons via topic name match`);
          } else {
            console.log(`⚠️ No lessons found via topic name match`);
            
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
              console.log(`✅ Found ${lessons.length} lessons via manual filtering`);
            } else {
              console.log(`⚠️ No lessons found after all strategies`);
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
        name: topic.name || topic.topicName,
        topicName: topic.name || topic.topicName,
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

    console.log(`✅ Successfully returning topic "${topic.name}" with ${lessons.length} lessons`);
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
    console.log(`📋 Fetching all topics...`);
    
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
    
    console.log(`📦 Successfully returned ${topics.length} topics`);
    
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
    console.log(`🏥 Health check for topics...`);
    
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

  if (!subject || !level || !name?.en) {
    console.warn('⚠️ Validation failed - Missing required fields');
    return res.status(400).json({ 
      success: false,
      message: '❌ Required fields missing: subject, level, name.en',
      error: 'VALIDATION_ERROR'
    });
  }

  try {
    const duplicate = await Topic.findOne({ 
      subject, 
      level, 
      'name.en': name.en 
    });
    
    if (duplicate) {
      console.warn(`⚠️ Duplicate topic attempt: "${name.en}"`);
      return res.status(409).json({ 
        success: false,
        message: '⚠️ Topic with this name already exists',
        error: 'DUPLICATE_TOPIC'
      });
    }

    const newTopic = new Topic({ subject, level, name, description });
    const saved = await newTopic.save();
    
    console.log(`✅ Successfully created topic: "${saved.name.en}"`);
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
      console.warn(`⚠️ Cannot fetch lessons - topic not found: ${id}`);
      return res.status(404).json({ 
        success: false,
        message: '❌ Topic not found',
        error: 'TOPIC_NOT_FOUND'
      });
    }

    console.log(`✅ Topic exists, fetching lessons for: ${id}`);
    
    const lessons = await Lesson.find({ topicId: id }).sort({ order: 1, createdAt: 1 });
    console.log(`📚 Found ${lessons.length} lessons for topic ID ${id}`);

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
    
    console.log(`✅ Successfully deleted topic: "${topic.name.en}"`);

    res.json({
      success: true,
      message: '✅ Topic and associated lessons deleted successfully',
      deletedTopic: {
        id: id,
        name: topic.name.en
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

    console.log(`✅ Successfully updated topic: "${topic.name.en}"`);
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