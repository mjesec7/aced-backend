const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Topic = require('../models/topic');
const Lesson = require('../models/lesson');

// ✅ Validate MongoDB ObjectId
function validateObjectId(req, res, next) {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    console.warn(`⚠️ Invalid ObjectId format: ${id}`);
    return res.status(400).json({ 
      message: '❌ Invalid topic ID format',
      error: 'INVALID_OBJECT_ID',
      providedId: id
    });
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

// ─── [GET] All Topics ───────────────────────────────
router.get('/', logRequest, async (req, res) => {
  try {
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
      error: 'DATABASE_ERROR'
    });
  }
});

// ─── [POST] Create New Topic ─────────────────────────
router.post('/', logRequest, async (req, res) => {
  const { subject, level, name, description } = req.body;

  // Enhanced validation
  if (!subject || !level || !name?.en) {
    console.warn('⚠️ Validation failed - Missing required fields');
    console.warn('📝 Received:', { subject, level, nameEn: name?.en });
    return res.status(400).json({ 
      success: false,
      message: '❌ Required fields missing: subject, level, name.en',
      error: 'VALIDATION_ERROR',
      required: ['subject', 'level', 'name.en'],
      received: { subject: !!subject, level: !!level, nameEn: !!name?.en }
    });
  }

  try {
    // Check for duplicate
    const duplicate = await Topic.findOne({ 
      subject, 
      level, 
      'name.en': name.en 
    });
    
    if (duplicate) {
      console.warn(`⚠️ Duplicate topic attempt: "${name.en}" (ID: ${duplicate._id})`);
      return res.status(409).json({ 
        success: false,
        message: '⚠️ Topic with this name already exists',
        error: 'DUPLICATE_TOPIC',
        existingId: duplicate._id
      });
    }

    const newTopic = new Topic({ subject, level, name, description });
    const saved = await newTopic.save();
    
    console.log(`✅ Successfully created topic: "${saved.name.en}" (ID: ${saved._id})`);
    res.status(201).json({
      success: true,
      message: '✅ Topic created successfully',
      data: saved
    });
  } catch (err) {
    console.error('❌ Failed to create topic:', err.message);
    console.error('📍 Stack trace:', err.stack);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error while creating topic',
      error: 'DATABASE_ERROR'
    });
  }
});

// ─── [GET] Single Topic + Lessons ────────────────────
// ✅ IMPROVED: Topic route handler in topicRoutes.js
// This addresses the 404 issue and ensures consistent response structure

// ─── [GET] Single Topic + Lessons ────────────────────
router.get('/:id', logRequest, validateObjectId, async (req, res) => {
  const id = req.params.id;
  
  try {
    console.log(`🔍 Searching for topic with ID: ${id}`);
    
    // ✅ ENHANCED: Better topic finding with multiple fallback strategies
    let topic = null;
    
    // Strategy 1: Find by MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(id)) {
      topic = await Topic.findById(id);
      if (topic) {
        console.log(`📘 Found topic by ObjectId: "${topic.name || topic.topicName}"`);
      }
    }
    
    // Strategy 2: If not found and ID looks like a name, search by name
    if (!topic && isNaN(id) && id.length > 2) {
      topic = await Topic.findOne({ 
        $or: [
          { name: id },
          { 'name.en': id },
          { 'name.ru': id },
          { 'name.uz': id },
          { topicName: id }
        ]
      });
      if (topic) {
        console.log(`📘 Found topic by name: "${topic.name || topic.topicName}"`);
      }
    }
    
    // Strategy 3: If still not found, try case-insensitive search
    if (!topic && typeof id === 'string') {
      topic = await Topic.findOne({ 
        $or: [
          { name: { $regex: new RegExp(`^${id}$`, 'i') } },
          { 'name.en': { $regex: new RegExp(`^${id}$`, 'i') } },
          { topicName: { $regex: new RegExp(`^${id}$`, 'i') } }
        ]
      });
      if (topic) {
        console.log(`📘 Found topic by case-insensitive search: "${topic.name || topic.topicName}"`);
      }
    }
    
    // ✅ FIXED: Return consistent 404 response if topic not found
    if (!topic) {
      console.warn(`⚠️ Topic not found in database: ${id}`);
      
      return res.status(404).json({ 
        success: false,
        exists: false,
        message: '❌ Topic not found',
        error: 'TOPIC_NOT_FOUND',
        requestedId: id,
        suggestion: 'Please verify the topic ID is correct and the topic exists',
        searchStrategies: [
          'MongoDB ObjectId lookup',
          'Name-based search',
          'Case-insensitive search'
        ]
      });
    }

    console.log(`📘 Topic found successfully: "${topic.name || topic.topicName}"`);
    
    // ✅ ENHANCED: Fetch associated lessons with better error handling
    let lessons = [];
    let lessonError = null;
    
    try {
      lessons = await Lesson.find({ topicId: id }).sort({ order: 1, createdAt: 1 });
      console.log(`📚 Found ${lessons.length} lessons for topic "${topic.name || topic.topicName}"`);
    } catch (lessonErr) {
      console.error(`⚠️ Error fetching lessons for topic ${id}:`, lessonErr.message);
      lessonError = lessonErr.message;
      // Continue without lessons rather than failing completely
      lessons = [];
    }

    // ✅ ENHANCED: Inject topicId into each lesson for frontend use
    const lessonsWithTopicId = lessons.map(lesson => ({
      ...lesson.toObject(),
      topicId: id
    }));

    // ✅ CONSISTENT: Return standardized response structure
    const response = {
      success: true,
      exists: true,
      message: '✅ Topic loaded successfully',
      data: {
        // ✅ FIXED: Ensure topic has all necessary fields
        _id: topic._id,
        id: topic._id, // Legacy support
        name: topic.name || topic.topicName,
        topicName: topic.name || topic.topicName, // Legacy support
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
        lessonsFound: lessons.length,
        hasLessonError: !!lessonError,
        searchMethod: 'database_lookup'
      }
    };

    console.log(`✅ Successfully returning topic "${topic.name || topic.topicName}" with ${lessons.length} lessons`);
    res.json(response);
    
  } catch (err) {
    console.error(`❌ Error fetching topic ${id}:`, err.message);
    console.error('📍 Stack trace:', err.stack);
    
    // ✅ ENHANCED: Handle specific error types
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
// ─── [GET] Lessons for Topic ─────────────────────────
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
        error: 'TOPIC_NOT_FOUND',
        requestedId: id
      });
    }

    console.log(`✅ Topic exists, fetching lessons for: ${id}`);
    
    const lessons = await Lesson.find({ topicId: id }).sort({ order: 1, createdAt: 1 });
    console.log(`📚 Found ${lessons.length} lessons for topic ID ${id}`);

    // Inject topicId into each lesson for frontend use
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
    console.error('📍 Stack trace:', err.stack);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error while fetching lessons',
      error: 'DATABASE_ERROR',
      requestedId: id
    });
  }
});

// ─── [DELETE] Delete Topic ─────────────────────────
router.delete('/:id', logRequest, validateObjectId, async (req, res) => {
  const id = req.params.id;
  
  try {
    console.log(`🗑️ Attempting to delete topic: ${id}`);
    
    const topic = await Topic.findById(id);
    if (!topic) {
      console.warn(`⚠️ Cannot delete - topic not found: ${id}`);
      return res.status(404).json({ 
        success: false,
        message: '❌ Topic not found',
        error: 'TOPIC_NOT_FOUND',
        requestedId: id
      });
    }

    // Delete associated lessons first
    const lessonDeleteResult = await Lesson.deleteMany({ topicId: id });
    console.log(`🗑️ Deleted ${lessonDeleteResult.deletedCount} lessons for topic "${topic.name.en}"`);

    // Delete the topic
    await Topic.findByIdAndDelete(id);
    console.log(`✅ Successfully deleted topic: "${topic.name.en}" (ID: ${id})`);

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
    console.error('📍 Stack trace:', err.stack);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error while deleting topic',
      error: 'DATABASE_ERROR',
      requestedId: id
    });
  }
});

// ─── [PUT] Update Topic ─────────────────────────────
router.put('/:id', logRequest, validateObjectId, async (req, res) => {
  const id = req.params.id;
  const updates = req.body;
  
  try {
    console.log(`✏️ Attempting to update topic: ${id}`);
    
    const topic = await Topic.findByIdAndUpdate(
      id, 
      updates, 
      { new: true, runValidators: true }
    );
    
    if (!topic) {
      console.warn(`⚠️ Cannot update - topic not found: ${id}`);
      return res.status(404).json({ 
        success: false,
        message: '❌ Topic not found',
        error: 'TOPIC_NOT_FOUND',
        requestedId: id
      });
    }

    console.log(`✅ Successfully updated topic: "${topic.name.en}" (ID: ${id})`);
    res.json({
      success: true,
      message: '✅ Topic updated successfully',
      data: topic
    });
    
  } catch (err) {
    console.error(`❌ Error updating topic ${id}:`, err.message);
    console.error('📍 Stack trace:', err.stack);
    res.status(500).json({ 
      success: false,
      message: '❌ Server error while updating topic',
      error: 'DATABASE_ERROR',
      requestedId: id
    });
  }
});

// ─── [GET] Health Check ─────────────────────────────
router.get('/health/check', async (req, res) => {
  try {
    const topicCount = await Topic.countDocuments();
    const lessonCount = await Lesson.countDocuments();
    
    res.json({
      success: true,
      message: '✅ Topic routes are healthy',
      stats: {
        topics: topicCount,
        lessons: lessonCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('❌ Health check failed:', err.message);
    res.status(500).json({
      success: false,
      message: '❌ Health check failed',
      error: 'DATABASE_ERROR'
    });
  }
});

module.exports = router;