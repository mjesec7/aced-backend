const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const UserProgress = require('../models/userProgress');
const Lesson = require('../models/lesson');
const verifyToken = require('../middlewares/authMiddleware');

// ✅ CRITICAL: ObjectId validation and extraction utility
const extractValidObjectId = (value, fieldName = 'ObjectId') => {
  if (!value) {
    return null;
  }
  
  try {
    let idString = null;
    
    // Handle different input types
    if (typeof value === 'string') {
      idString = value.trim();
    } else if (typeof value === 'object' && value !== null) {
      // Try to extract ID from object - handle all possible field names
      idString = value._id || value.id || value.topicId || value.lessonId || value.ObjectId;
      
      // If it's still an object, convert to string
      if (typeof idString === 'object' && idString !== null) {
        idString = idString.toString();
      }
    } else {
      idString = value.toString();
    }
    
    // Check for invalid string representations
    if (!idString || 
        idString === '[object Object]' || 
        idString === 'null' || 
        idString === 'undefined' ||
        idString === 'NaN' ||
        idString.includes('[object') ||
        idString.length === 0) {
      console.warn(`⚠️ Invalid ${fieldName} detected:`, {
        original: value,
        extracted: idString,
        type: typeof value
      });
      return null;
    }
    
    // Validate ObjectId format (24 character hex string)
    if (!mongoose.Types.ObjectId.isValid(idString)) {
      console.warn(`⚠️ Invalid ${fieldName} format:`, {
        value: idString,
        length: idString.length,
        isHex: /^[0-9a-fA-F]+$/.test(idString)
      });
      return null;
    }
    
    console.log(`✅ Valid ${fieldName} extracted:`, idString);
    return idString;
  } catch (error) {
    console.error(`❌ Error extracting ${fieldName}:`, {
      error: error.message,
      originalValue: value,
      valueType: typeof value
    });
    return null;
  }
};

// ✅ ENHANCED: Logging middleware for debugging
router.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log('\n📤 UserProgress Route Request:');
    console.log(`🔗 URL: ${req.originalUrl}`);
    console.log(`📋 Headers: Authorization: ${req.headers.authorization ? 'Present' : 'Missing'}`);
    
    // Log the problematic fields specifically
    if (req.body) {
      console.log('📦 Request Body Analysis:');
      console.log(`  userId: ${JSON.stringify(req.body.userId)} (${typeof req.body.userId})`);
      console.log(`  lessonId: ${JSON.stringify(req.body.lessonId)} (${typeof req.body.lessonId})`);
      console.log(`  topicId: ${JSON.stringify(req.body.topicId)} (${typeof req.body.topicId})`);
      console.log(`  progressPercent: ${req.body.progressPercent}`);
      console.log(`  completed: ${req.body.completed}`);
      
      // Special check for the problematic topicId
      if (req.body.topicId) {
        console.log('🔍 TopicId Deep Analysis:');
        console.log(`  Raw value: ${req.body.topicId}`);
        console.log(`  String representation: "${req.body.topicId.toString()}"`);
        console.log(`  JSON stringify: ${JSON.stringify(req.body.topicId)}`);
        console.log(`  Is object: ${typeof req.body.topicId === 'object'}`);
        if (typeof req.body.topicId === 'object') {
          console.log(`  Object keys: ${Object.keys(req.body.topicId)}`);
          console.log(`  Object values: ${Object.values(req.body.topicId)}`);
        }
      }
    }
  }
  next();
});

// ✅ GET /api/progress - Load progress
router.get('/', async (req, res) => {
  const { userId, lessonId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ message: '❌ userId is required as query parameter.' });
  }

  try {
    if (lessonId) {
      // Validate lessonId if provided
      const validLessonId = extractValidObjectId(lessonId, 'lessonId');
      if (!validLessonId) {
        return res.status(400).json({ 
          message: '❌ Invalid lessonId format.',
          received: lessonId,
          expected: '24-character hex string'
        });
      }
      
      // Load specific lesson progress
      const progress = await UserProgress.findOne({ userId, lessonId: validLessonId })
        .populate('lessonId', 'title description order')
        .populate('topicId', 'title description order');
      
      return res.status(200).json({
        message: '✅ Progress loaded',
        data: progress || null
      });
    } else {
      // Load all progress for user
      const progressRecords = await UserProgress.find({ userId })
        .populate('lessonId', 'title description order')
        .populate('topicId', 'title description order')
        .sort({ updatedAt: -1 });

      return res.status(200).json({
        message: '✅ All progress loaded',
        data: progressRecords
      });
    }
  } catch (error) {
    console.error('❌ Error loading progress:', error);
    res.status(500).json({ message: '❌ Server error', error: error.message });
  }
});

// ✅ ENHANCED: GET /api/progress/lesson/:lessonId/user/:userId - Get specific lesson progress
router.get('/lesson/:lessonId/user/:userId', async (req, res) => {
  try {
    const { lessonId, userId } = req.params;
    
    const validLessonId = extractValidObjectId(lessonId, 'lessonId');
    if (!validLessonId) {
      return res.status(400).json({
        success: false,
        message: '❌ Invalid lessonId format',
        received: lessonId
      });
    }
    
    const progress = await UserProgress.findOne({ 
      userId, 
      lessonId: validLessonId 
    }).populate('lessonId', 'lessonName subject level');
    
    if (!progress) {
      return res.json({
        success: true,
        progress: null,
        hasProgress: false,
        message: 'No progress found for this lesson'
      });
    }
    
    res.json({
      success: true,
      progress: {
        lessonId: progress.lessonId,
        userId: progress.userId,
        completed: progress.completed,
        completedAt: progress.completedAt,
        progressPercent: progress.progressPercent || 0,
        currentStep: progress.currentStep || 0,
        totalSteps: progress.totalSteps || 0,
        stars: progress.stars || 0,
        score: progress.score || 0,
        timeSpent: progress.timeSpent || 0,
        mistakes: progress.mistakes || 0,
        lastAccessed: progress.updatedAt,
        completedSteps: progress.completedSteps || []
      },
      hasProgress: true,
      lesson: progress.lessonId
    });
    
  } catch (error) {
    console.error('❌ Error getting lesson progress:', error);
    res.status(500).json({
      success: false,
      message: '❌ Failed to get lesson progress',
      error: error.message
    });
  }
});
router.post('/user-progress', verifyToken, async (req, res) => {
  console.log('💾 POST /api/user-progress - Alternative progress save endpoint');
  
  try {
    const progressData = req.body;
    const firebaseId = progressData.userId || req.user?.uid;
    
    console.log('📝 User-progress data received:', {
      userId: firebaseId,
      lessonId: progressData.lessonId,
      progressPercent: progressData.progressPercent
    });
    
    // Basic validation
    if (!firebaseId) {
      return res.status(400).json({
        success: false,
        message: '❌ userId is required.',
        error: '❌ userId and lessonId are required.'
      });
    }
    
    if (!progressData.lessonId) {
      return res.status(400).json({
        success: false,
        message: '❌ lessonId is required.',
        error: '❌ userId and lessonId are required.'
      });
    }
    
    // Validate lessonId
    const validLessonId = extractValidObjectId(progressData.lessonId, 'lessonId');
    if (!validLessonId) {
      return res.status(400).json({ 
        success: false,
        message: '❌ Invalid lessonId format.',
        error: '❌ userId and lessonId are required.'
      });
    }
    
    // Get topicId from lesson if needed
    let finalTopicId = null;
    try {
      const lesson = await Lesson.findById(validLessonId);
      if (lesson && lesson.topicId) {
        finalTopicId = extractValidObjectId(lesson.topicId, 'lesson.topicId');
      }
    } catch (lessonError) {
      console.warn('⚠️ Could not fetch lesson for topicId:', lessonError.message);
    }
    
    const updateData = {
      userId: firebaseId,
      lessonId: validLessonId,
      topicId: finalTopicId,
      completedSteps: progressData.completedSteps || [],
      progressPercent: Math.min(100, Math.max(0, Number(progressData.progressPercent) || 0)),
      completed: Boolean(progressData.completed),
      currentStep: Math.max(0, Number(progressData.currentStep) || 0),
      totalSteps: Math.max(0, Number(progressData.totalSteps) || 0),
      mistakes: Math.max(0, Number(progressData.mistakes) || 0),
      medal: String(progressData.medal || 'none'),
      duration: Math.max(0, Number(progressData.duration) || 0),
      timeSpent: Math.max(0, Number(progressData.timeSpent) || Number(progressData.duration) || 0),
      stars: Math.min(5, Math.max(0, Number(progressData.stars) || 0)),
      score: Math.max(0, Number(progressData.score) || 0),
      points: Math.max(0, Number(progressData.points) || 0),
      hintsUsed: Math.max(0, Number(progressData.hintsUsed) || 0),
      submittedHomework: Boolean(progressData.submittedHomework),
      updatedAt: new Date()
    };

    // Set completedAt when lesson is marked as completed
    if (updateData.completed && !updateData.completedAt) {
      updateData.completedAt = new Date();
    }
    
    // Remove null/undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === null || updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    
    const updated = await UserProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId: validLessonId },
      updateData,
      { upsert: true, new: true, runValidators: true }
    );
    
    console.log('✅ Progress saved via /api/user-progress');
    
    res.json({
      success: true,
      data: updated,
      message: '✅ Progress saved/updated',
      endpoint: 'user-progress'
    });
    
  } catch (error) {
    console.error('❌ Error in /api/user-progress:', error);
    
    if (error.name === 'CastError') {
      res.status(400).json({ 
        success: false,
        message: '❌ Invalid data format - ObjectId casting failed',
        error: '❌ userId and lessonId are required.'
      });
    } else if (error.name === 'ValidationError') {
      res.status(400).json({ 
        success: false,
        message: '❌ Validation error',
        error: '❌ userId and lessonId are required.'
      });
    } else {
      res.status(500).json({ 
        success: false,
        message: '❌ Server error',
        error: '❌ Server error'
      });
    }
  }
});

// ✅ FIXED: POST /api/progress - Save or update user progress
router.post('/', verifyToken, async (req, res) => {
  console.log('\n🚀 POST /api/progress - Starting request processing');
  
  try {
    const {
      userId,
      lessonId,
      topicId,
      completedSteps = [],
      progressPercent = 0,
      completed = false,
      currentStep = 0,
      totalSteps = 0,
      mistakes = 0,
      medal = 'none',
      duration = 0,
      timeSpent = 0,
      stars = 0,
      score = 0,
      points = 0,
      hintsUsed = 0,
      submittedHomework = false
    } = req.body;

    // Use Firebase UID from token if userId not provided
    const firebaseId = userId || req.user?.uid;

    if (!firebaseId || !lessonId) {
      console.error('❌ Missing required fields:', { 
        firebaseId: !!firebaseId, 
        lessonId: !!lessonId 
      });
      return res.status(400).json({ 
        message: '❌ userId and lessonId are required.',
        missing: {
          userId: !firebaseId,
          lessonId: !lessonId
        }
      });
    }

    // ✅ STEP 1: Validate and extract lessonId
    console.log('🔍 Step 1: Validating lessonId...');
    const validLessonId = extractValidObjectId(lessonId, 'lessonId');
    if (!validLessonId) {
      console.error('❌ Invalid lessonId received:', {
        original: lessonId,
        type: typeof lessonId,
        stringified: JSON.stringify(lessonId)
      });
      return res.status(400).json({ 
        message: '❌ Invalid lessonId format.',
        received: {
          value: lessonId,
          type: typeof lessonId,
          stringified: JSON.stringify(lessonId)
        },
        expected: '24-character hex string like "6839dfac0ee10d51ff4a5dcb"'
      });
    }
    console.log('✅ Valid lessonId:', validLessonId);

    // ✅ STEP 2: Handle topicId validation and extraction
    console.log('🔍 Step 2: Processing topicId...');
    let finalTopicId = null;
    
    // First, try to extract topicId from request if provided
    if (topicId !== undefined && topicId !== null) {
      console.log('🔍 TopicId provided in request, attempting extraction...');
      finalTopicId = extractValidObjectId(topicId, 'topicId');
      
      if (finalTopicId) {
        console.log('✅ Valid topicId extracted from request:', finalTopicId);
      } else {
        console.warn('⚠️ Invalid topicId in request, will try to get from lesson:', {
          original: topicId,
          type: typeof topicId,
          stringified: JSON.stringify(topicId)
        });
      }
    } else {
      console.log('ℹ️ No topicId provided in request');
    }
    
    // If no valid topicId from request, try to get it from the lesson
    if (!finalTopicId) {
      console.log('🔍 Attempting to get topicId from lesson...');
      try {
        const lesson = await Lesson.findById(validLessonId);
        if (lesson && lesson.topicId) {
          finalTopicId = extractValidObjectId(lesson.topicId, 'lesson.topicId');
          if (finalTopicId) {
            console.log('✅ Valid topicId retrieved from lesson:', finalTopicId);
          } else {
            console.warn('⚠️ Invalid topicId in lesson document:', lesson.topicId);
          }
        } else {
          console.warn('⚠️ Lesson not found or has no topicId:', {
            lessonFound: !!lesson,
            hasTopicId: !!(lesson && lesson.topicId)
          });
        }
      } catch (error) {
        console.error('❌ Error fetching lesson for topicId:', error.message);
      }
    }

    // ✅ STEP 3: Prepare update data with validation
    console.log('🔍 Step 3: Preparing update data...');
    const updateData = {
      completedSteps: Array.isArray(completedSteps) ? completedSteps : [],
      progressPercent: Math.min(100, Math.max(0, Number(progressPercent) || 0)),
      completed: Boolean(completed),
      currentStep: Math.max(0, Number(currentStep) || 0),
      totalSteps: Math.max(0, Number(totalSteps) || 0),
      mistakes: Math.max(0, Number(mistakes) || 0),
      medal: String(medal || 'none'),
      duration: Math.max(0, Number(duration) || 0),
      timeSpent: Math.max(0, Number(timeSpent) || Number(duration) || 0),
      stars: Math.min(5, Math.max(0, Number(stars) || 0)),
      score: Math.max(0, Number(score) || 0),
      points: Math.max(0, Number(points) || 0),
      hintsUsed: Math.max(0, Number(hintsUsed) || 0),
      submittedHomework: Boolean(submittedHomework),
      updatedAt: new Date()
    };

    // Set completedAt when lesson is marked as completed
    if (completed && !updateData.completedAt) {
      updateData.completedAt = new Date();
    }

    // ✅ CRITICAL: Only add topicId if it's valid
    if (finalTopicId) {
      updateData.topicId = finalTopicId;
      console.log('✅ Adding valid topicId to update data:', finalTopicId);
    } else {
      console.log('⚠️ No valid topicId available - saving progress without topicId');
      // Explicitly unset topicId if it was invalid
      updateData.$unset = { topicId: "" };
    }

    console.log('📝 Final update data summary:', {
      userId: firebaseId,
      lessonId: validLessonId,
      topicId: finalTopicId || 'not set',
      progressPercent: updateData.progressPercent,
      completed: updateData.completed,
      currentStep: updateData.currentStep,
      totalSteps: updateData.totalSteps,
      hasTopicId: !!finalTopicId
    });

    // ✅ STEP 4: Perform the database update
    console.log('🔍 Step 4: Updating database...');
    const updated = await UserProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId: validLessonId },
      updateData,
      { 
        upsert: true, 
        new: true, 
        runValidators: true,
        context: 'query' // Important for mongoose validation
      }
    );

    console.log('✅ Progress saved successfully:', {
      id: updated._id,
      userId: updated.userId,
      lessonId: updated.lessonId,
      topicId: updated.topicId || 'not set',
      progressPercent: updated.progressPercent,
      completed: updated.completed,
      currentStep: updated.currentStep,
      totalSteps: updated.totalSteps
    });

    res.status(200).json({
      message: '✅ Progress saved/updated',
      data: updated,
      debug: {
        receivedTopicId: {
          original: topicId,
          type: typeof topicId,
          stringified: JSON.stringify(topicId)
        },
        processedTopicId: finalTopicId,
        fromLesson: !req.body.topicId && !!finalTopicId
      }
    });

  } catch (error) {
    console.error('\n❌ ERROR in POST /api/progress:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Enhanced error reporting for specific error types
    if (error.name === 'CastError') {
      console.error('❌ CAST ERROR Details:');
      console.error('  Field causing error:', error.path);
      console.error('  Invalid value:', error.value);
      console.error('  Expected type:', error.kind);
      console.error('  String representation:', String(error.value));
      
      return res.status(400).json({ 
        message: '❌ Invalid data format - ObjectId casting failed', 
        error: {
          field: error.path,
          receivedValue: error.value,
          receivedType: typeof error.value,
          expectedType: error.kind,
          stringRepresentation: String(error.value)
        },
        solution: `The field '${error.path}' must be a valid 24-character hex string ObjectId, not: ${error.value}`
      });
    } else if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(e => ({
        field: e.path,
        message: e.message,
        value: e.value,
        kind: e.kind
      }));
      
      console.error('❌ VALIDATION ERROR Details:', validationErrors);
      
      return res.status(400).json({ 
        message: '❌ Validation error', 
        errors: validationErrors
      });
    } else if (error.name === 'MongooseError') {
      console.error('❌ MONGOOSE ERROR:', error.message);
      return res.status(500).json({
        message: '❌ Database error',
        error: error.message
      });
    }
    
    // Generic error response
    res.status(500).json({ 
      message: '❌ Server error', 
      error: error.message,
      type: error.name
    });
  }
});

// ✅ Enhanced error handling middleware
router.use((error, req, res, next) => {
  console.error('\n🔥 UserProgress Route Error Handler:');
  console.error('URL:', req.originalUrl);
  console.error('Method:', req.method);
  console.error('Error:', error.message);
  console.error('Error Type:', error.name);
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      message: '❌ Invalid ObjectId format',
      field: error.path,
      value: error.value,
      expected: '24-character hex string',
      url: req.originalUrl
    });
  }
  
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(e => ({
      field: e.path,
      message: e.message,
      value: e.value
    }));
    
    return res.status(400).json({
      message: '❌ Validation failed',
      errors: errors,
      url: req.originalUrl
    });
  }
  
  // Pass to global error handler if not handled here
  next(error);
});

module.exports = router;