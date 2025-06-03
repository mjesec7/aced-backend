const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// ✅ Models
const User = require('../models/user');
const TopicProgress = require('../models/topicProgress');
const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const UserProgress = require('../models/userProgress');

// ✅ Firebase & Middleware
const admin = require('../config/firebase');
const verifyToken = require('../middlewares/authMiddleware');

// ✅ Controllers
const homeworkController = require('../controllers/homeworkController');
const testController = require('../controllers/testController');
const userProgressController = require('../controllers/userProgressController');
const { getRecommendations } = require('../controllers/recommendationController');

console.log('✅ userRoutes.js loaded');

// Middleware
function validateFirebaseId(req, res, next) {
  if (!req.params.firebaseId) return res.status(400).json({ error: '❌ Missing firebaseId' });
  next();
}

function verifyOwnership(req, res, next) {
  if (!req.user || req.user.uid !== req.params.firebaseId)
    return res.status(403).json({ error: '❌ Access denied: User mismatch' });
  next();
}

function validateObjectId(req, res, next) {
  const { id } = req.params;
  if (id && !mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ error: '❌ Invalid ObjectId' });
  next();
}

// Auth Save
router.post('/save', async (req, res) => {
  const { token, name, subscriptionPlan } = req.body;
  if (!token || !name) return res.status(400).json({ error: '❌ Missing token or name' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const firebaseId = decoded.uid;
    const email = decoded.email;

    let user = await User.findOne({ firebaseId });
    if (!user) {
      user = new User({ firebaseId, email, name, subscriptionPlan: subscriptionPlan || 'free' });
    } else {
      user.email = email;
      user.name = name;
      if (subscriptionPlan) user.subscriptionPlan = subscriptionPlan;
    }

    await user.save();
    res.json(user);
  } catch (err) {
    console.error('❌ Firebase token invalid:', err.message);
    res.status(401).json({ error: '❌ Invalid Firebase token' });
  }
});

// Info
router.get('/:firebaseId', validateFirebaseId, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json(user);
  } catch {
    res.status(500).json({ error: '❌ Server error' });
  }
});

router.get('/:firebaseId/status', validateFirebaseId, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json({ status: user.subscriptionPlan || 'free' });
  } catch {
    res.status(500).json({ error: '❌ Server error' });
  }
});

// ✅ NEW: Recommendations route (was missing!)
router.get('/:firebaseId/recommendations', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📥 GET recommendations for user:', req.params.firebaseId);
  
  try {
    // If you have a recommendation controller, use it:
    if (getRecommendations) {
      return getRecommendations(req, res);
    }
    
    // Otherwise, provide a basic implementation:
    const userId = req.params.firebaseId;
    
    // Get user's study list to exclude already added topics
    const user = await User.findOne({ firebaseId: userId });
    const studyListTopicIds = user?.studyList?.map(item => item.topicId?.toString()) || [];
    
    // Get all topics that aren't in the user's study list
    const allTopics = await Topic.find({
      _id: { $nin: studyListTopicIds }
    }).limit(10);
    
    // Get lessons for each topic to ensure they have content
    const topicsWithLessons = await Promise.all(
      allTopics.map(async (topic) => {
        const lessons = await Lesson.find({ topicId: topic._id });
        return {
          ...topic.toObject(),
          lessons: lessons
        };
      })
    );
    
    // Filter out topics without lessons
    const recommendations = topicsWithLessons.filter(topic => topic.lessons.length > 0);
    
    console.log(`✅ Returning ${recommendations.length} recommendations`);
    res.json(recommendations);
    
  } catch (error) {
    console.error('❌ Error fetching recommendations:', error);
    res.status(500).json({ error: '❌ Error fetching recommendations' });
  }
});

// ✅ Get user's progress for a specific lesson
router.get('/:firebaseId/lesson/:lessonId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const { firebaseId, lessonId } = req.params;
    
    // Find the user's progress for this specific lesson
    const progress = await UserProgress.findOne({ 
      userId: firebaseId, 
      lessonId: lessonId 
    }).populate('lessonId', 'title description').populate('topicId', 'name description');
    
    // If no progress found, return empty object (not 404)
    // This matches what your frontend expects
    if (!progress) {
      return res.status(200).json({});
    }
    
    res.json(progress);
  } catch (error) {
    console.error('❌ Error fetching user lesson progress:', error);
    res.status(500).json({ error: '❌ Error fetching lesson progress' });
  }
});

// ✅ Save user's progress for a specific lesson
router.post('/:firebaseId/lesson/:lessonId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const { firebaseId, lessonId } = req.params;
    const progressData = req.body;
    
    // Get the lesson to find its topicId
    let topicId = progressData.topicId;
    if (!topicId) {
      const lesson = await Lesson.findById(lessonId);
      if (lesson) {
        topicId = lesson.topicId;
      }
    }
    
    const updateData = {
      userId: firebaseId,
      lessonId: lessonId,
      topicId: topicId,
      ...progressData,
      updatedAt: new Date()
    };
    
    const updated = await UserProgress.findOneAndUpdate(
      { userId: firebaseId, lessonId },
      updateData,
      { upsert: true, new: true }
    );
    
    res.json(updated);
  } catch (error) {
    console.error('❌ Error saving user lesson progress:', error);
    res.status(500).json({ error: '❌ Error saving lesson progress' });
  }
});

// Study List
// ✅ ENHANCED Study List GET with cleanup
router.get('/:firebaseId/study-list', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    
    // Initialize study list if it doesn't exist
    if (!user.studyList) {
      user.studyList = [];
      await user.save();
      return res.json([]);
    }
    
    // Validate and clean up invalid topic references
    const validStudyList = [];
    const invalidTopicIds = [];
    let needsCleanup = false;
    
    for (const entry of user.studyList) {
      if (!entry.topicId) {
        // Entry without topicId - keep it but log warning
        console.warn('⚠️ Study list entry without topicId:', entry);
        validStudyList.push(entry);
        continue;
      }
      
      try {
        // Check if topic exists in database
        const topicExists = await Topic.exists({ _id: entry.topicId });
        
        if (topicExists) {
          validStudyList.push(entry);
        } else {
          console.warn(`🗑️ Invalid topic reference found: ${entry.topicId} - "${entry.name}"`);
          invalidTopicIds.push(entry.topicId.toString());
          needsCleanup = true;
        }
      } catch (validationError) {
        console.error(`❌ Error validating topic ${entry.topicId}:`, validationError.message);
        // Keep entry if we can't validate (network issues, etc.)
        validStudyList.push(entry);
      }
    }
    
    // Clean up invalid references if found
    if (needsCleanup) {
      console.log(`🧹 Cleaning up ${invalidTopicIds.length} invalid topic references`);
      user.studyList = validStudyList;
      await user.save();
      console.log(`✅ Cleaned study list: ${user.studyList.length} valid entries remaining`);
    }
    
    res.json(user.studyList);
    
  } catch (error) {
    console.error('❌ Error fetching study list:', error);
    res.status(500).json({ error: '❌ Error fetching study list' });
  }
});

// ✅ ENHANCED Study List DELETE with better error handling
router.delete('/:firebaseId/study-list/:topicId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    
    if (!user.studyList) {
      return res.json({ message: '✅ Study list is empty', studyList: [] });
    }
    
    const initialCount = user.studyList.length;
    
    // Remove by topicId or by entry _id
    user.studyList = user.studyList.filter(entry => {
      const topicIdMatch = entry.topicId?.toString() !== req.params.topicId;
      const entryIdMatch = entry._id?.toString() !== req.params.topicId;
      return topicIdMatch && entryIdMatch;
    });
    
    const finalCount = user.studyList.length;
    const removedCount = initialCount - finalCount;
    
    await user.save();
    
    if (removedCount > 0) {
      console.log(`✅ Removed ${removedCount} entry(ies) from study list`);
      res.json({ 
        message: `✅ Removed ${removedCount} topic(s)`, 
        studyList: user.studyList,
        removedCount
      });
    } else {
      console.log(`⚠️ No matching entries found for removal: ${req.params.topicId}`);
      res.json({ 
        message: '⚠️ No matching topic found to remove', 
        studyList: user.studyList,
        removedCount: 0
      });
    }
    
  } catch (error) {
    console.error('❌ Error removing from study list:', error);
    res.status(500).json({ error: '❌ Error removing topic' });
  }
});

// ✅ FIXED Study List POST route - Validate topic exists before adding
router.post('/:firebaseId/study-list', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { subject, level, topic, topicId } = req.body;
  
  // Enhanced logging for debugging
  console.log('📥 Adding to study list:', { subject, level, topic, topicId });
  console.log('🔍 TopicId details:', {
    type: typeof topicId,
    value: topicId,
    isObject: typeof topicId === 'object',
    stringified: JSON.stringify(topicId)
  });
  
  // Validation
  if (!subject || !topic) {
    console.error('❌ Missing required fields:', { subject: !!subject, topic: !!topic });
    return res.status(400).json({ error: '❌ Missing subject or topic' });
  }
  
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) {
      console.error('❌ User not found:', req.params.firebaseId);
      return res.status(404).json({ error: '❌ User not found' });
    }

    console.log('✅ User found:', user.name);

    // Initialize studyList if it doesn't exist
    if (!user.studyList) {
      user.studyList = [];
      console.log('📝 Initialized empty study list');
    }

    // Check for duplicates
    const exists = user.studyList.some(entry => entry.name === topic && entry.subject === subject);
    
    if (exists) {
      console.log('⚠️ Topic already exists in study list');
      return res.json(user.studyList);
    }

    // Handle topicId - extract from object or validate string
    let validTopicId = null;
    
    if (topicId) {
      if (typeof topicId === 'object') {
        // If it's an object, try to extract _id or id field
        const extractedId = topicId._id || topicId.id || topicId.topicId;
        console.log('🔍 Extracted ID from object:', extractedId);
        
        if (extractedId && mongoose.Types.ObjectId.isValid(extractedId)) {
          validTopicId = extractedId; // Keep as string for now, convert after validation
          console.log('✅ Valid ObjectId format from object:', validTopicId);
        } else if (extractedId) {
          console.warn('⚠️ Invalid ObjectId format from object:', extractedId);
        }
      } else if (typeof topicId === 'string') {
        // If it's a string, validate it
        if (mongoose.Types.ObjectId.isValid(topicId)) {
          validTopicId = topicId; // Keep as string for now, convert after validation
          console.log('✅ Valid ObjectId format from string:', validTopicId);
        } else {
          console.warn('⚠️ Invalid ObjectId format from string:', topicId);
        }
      }
    }
    
    // CRITICAL FIX: Validate that the topic actually exists in the database
    if (validTopicId) {
      try {
        const topicExists = await Topic.findById(validTopicId);
        if (!topicExists) {
          console.error('❌ Topic not found in database:', validTopicId);
          return res.status(400).json({ 
            error: '❌ Topic not found in database',
            topicId: validTopicId
          });
        }
        console.log('✅ Topic verified in database:', topicExists.name || topicExists.title);
        
        // Now convert to ObjectId since we know it exists
        validTopicId = new mongoose.Types.ObjectId(validTopicId);
        
      } catch (dbError) {
        console.error('❌ Database error while validating topic:', dbError.message);
        return res.status(500).json({ 
          error: '❌ Error validating topic in database',
          details: dbError.message
        });
      }
    } else {
      // If no valid topicId provided, return error instead of generating new one
      console.error('❌ No valid topicId provided');
      return res.status(400).json({ 
        error: '❌ Valid topicId is required',
        provided: topicId,
        message: 'Topic must exist in the database before adding to study list'
      });
    }

    // Create new entry with properly validated topicId
    const newEntry = { 
      name: topic, 
      subject, 
      level: level || null, 
      topicId: validTopicId // Now guaranteed to be a valid ObjectId that exists in DB
    };
    
    console.log('➕ Adding new entry:', {
      name: newEntry.name,
      subject: newEntry.subject,
      level: newEntry.level,
      topicId: newEntry.topicId.toString()
    });
    
    // Add to study list
    user.studyList.push(newEntry);
    
    // Save to database
    await user.save();
    console.log('✅ Study list saved successfully');
    
    res.json(user.studyList);
    
  } catch (error) {
    console.error('❌ Error saving study list:', error);
    console.error('❌ Error stack:', error.stack);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      console.error('❌ Validation error details:');
      const validationDetails = [];
      
      for (const field in error.errors) {
        const fieldError = error.errors[field];
        console.error(`  - Field: ${field}`);
        console.error(`  - Message: ${fieldError.message}`);
        console.error(`  - Value: ${fieldError.value}`);
        
        validationDetails.push({
          field,
          message: fieldError.message,
          value: fieldError.value
        });
      }
      
      return res.status(400).json({ 
        error: '❌ Validation error', 
        details: validationDetails.map(d => `${d.field}: ${d.message}`),
        fullDetails: validationDetails
      });
    }
    
    res.status(500).json({ 
      error: '❌ Error saving study list',
      message: error.message
    });
  }
});

// Add this route to clean up existing invalid study list entries
router.post('/:firebaseId/study-list/cleanup', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('🧹 Starting study list cleanup for user:', req.params.firebaseId);
  
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) {
      return res.status(404).json({ error: '❌ User not found' });
    }
    
    if (!user.studyList || user.studyList.length === 0) {
      return res.json({ 
        message: '✅ Study list is empty, no cleanup needed',
        removedCount: 0,
        studyList: []
      });
    }
    
    console.log(`🔍 Checking ${user.studyList.length} study list entries`);
    
    const validEntries = [];
    const invalidEntries = [];
    
    // Check each entry
    for (const entry of user.studyList) {
      if (!entry.topicId) {
        console.warn('⚠️ Entry without topicId:', entry.name);
        invalidEntries.push({
          reason: 'No topicId',
          entry: entry.name || 'Unknown'
        });
        continue;
      }
      
      try {
        // Check if topic exists in database
        const topicExists = await Topic.findById(entry.topicId);
        
        if (topicExists) {
          validEntries.push(entry);
          console.log('✅ Valid entry:', entry.name);
        } else {
          console.warn('🗑️ Invalid topic reference:', entry.topicId, '-', entry.name);
          invalidEntries.push({
            reason: 'Topic not found in database',
            entry: entry.name || 'Unknown',
            topicId: entry.topicId.toString()
          });
        }
      } catch (validationError) {
        console.error('❌ Error validating entry:', entry.name, validationError.message);
        invalidEntries.push({
          reason: 'Validation error: ' + validationError.message,
          entry: entry.name || 'Unknown',
          topicId: entry.topicId?.toString() || 'Invalid'
        });
      }
    }
    
    // Update user's study list with only valid entries
    const originalCount = user.studyList.length;
    user.studyList = validEntries;
    
    await user.save();
    
    const removedCount = originalCount - validEntries.length;
    
    console.log(`🧹 Cleanup complete: ${removedCount} invalid entries removed, ${validEntries.length} valid entries kept`);
    
    res.json({
      message: `✅ Cleanup complete: ${removedCount} invalid entries removed`,
      originalCount,
      validCount: validEntries.length,
      removedCount,
      invalidEntries,
      studyList: user.studyList
    });
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    res.status(500).json({ 
      error: '❌ Error during cleanup',
      details: error.message 
    });
  }
});


router.delete('/:firebaseId/study-list/:topicId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    user.studyList = user.studyList.filter(entry =>
      entry.topicId?.toString() !== req.params.topicId && entry._id?.toString() !== req.params.topicId
    );
    await user.save();
    res.json({ message: '✅ Removed', studyList: user.studyList });
  } catch {
    res.status(500).json({ error: '❌ Error removing topic' });
  }
});

// User Progress Routes (using new controller)
router.get('/:firebaseId/progress', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  req.params.userId = req.params.firebaseId;
  return userProgressController.getUserProgress(req, res);
});

router.get('/:firebaseId/progress/lesson/:lessonId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  req.params.userId = req.params.firebaseId;
  return userProgressController.getLessonProgress(req, res);
});

router.get('/:firebaseId/progress/topic/:topicId', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  req.params.userId = req.params.firebaseId;
  return userProgressController.getTopicProgress(req, res);
});

router.get('/:firebaseId/progress/topics', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  req.params.userId = req.params.firebaseId;
  return userProgressController.getAllTopicsProgress(req, res);
});

// Lesson Progress (keeping existing for backward compatibility)
router.post('/:firebaseId/progress', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { lessonId, section } = req.body;
  if (!lessonId || !section) return res.status(400).json({ error: '❌ Missing lessonId or section' });
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    user.progress ||= {};
    user.progress[lessonId] ||= {};
    user.progress[lessonId][section] = true;
    await user.save();
    res.json(user.progress[lessonId]);
  } catch {
    res.status(500).json({ error: '❌ Error saving progress' });
  }
});

// Topic Progress
// Get all topics progress for a user
router.get('/:firebaseId/topics-progress', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    // Get all lessons
    const lessons = await Lesson.find({});
    const topicMap = {}; // Map to store all variations of topic identification
    
    // Build a map of all topic identifiers
    lessons.forEach(lesson => {
      if (lesson.topicId) {
        const topicIdStr = lesson.topicId.toString();
        
        if (!topicMap[topicIdStr]) {
          topicMap[topicIdStr] = {
            topicId: topicIdStr,
            topicName: lesson.topic,
            total: 0,
            completed: 0
          };
        }
        topicMap[topicIdStr].total++;
      }
    });
    
    // Get user progress
    const userProgress = await UserProgress.find({ userId: req.params.firebaseId });
    
    // Count completed lessons
    for (const progress of userProgress) {
      if (progress.completed && progress.lessonId) {
        const lesson = lessons.find(l => l._id.toString() === progress.lessonId.toString());
        if (lesson && lesson.topicId) {
          const topicIdStr = lesson.topicId.toString();
          if (topicMap[topicIdStr]) {
            topicMap[topicIdStr].completed++;
          }
        }
      }
    }
    
    // Build the response with multiple keys for each topic
    const topicProgress = {};
    
    Object.values(topicMap).forEach(topic => {
      const percentage = topic.total > 0 ? Math.round((topic.completed / topic.total) * 100) : 0;
      
      // Add progress by topicId
      topicProgress[topic.topicId] = percentage;
      
      // Also add by topic name if available
      if (topic.topicName) {
        topicProgress[topic.topicName] = percentage;
      }
      
      // Log for debugging
      console.log(`📊 Topic: ${topic.topicName} (${topic.topicId}) - ${topic.completed}/${topic.total} = ${percentage}%`);
    });
    
    res.json(topicProgress);
  } catch (error) {
    console.error('❌ Error calculating topic progress:', error);
    res.status(500).json({ error: '❌ Error calculating topic progress' });
  }
});

// ✅ FIXED ANALYTICS ROUTES - Both GET and POST
router.get('/:firebaseId/analytics', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📊 Analytics GET request received for user:', req.params.firebaseId);
  
  try {
    const firebaseId = req.params.firebaseId;
    
    // Get user progress data
    const userProgress = await UserProgress.find({ userId: firebaseId });
    const user = await User.findOne({ firebaseId });
    
    if (!user) {
      console.error('❌ User not found:', firebaseId);
      return res.status(404).json({ 
        success: false,
        error: '❌ User not found' 
      });
    }
    
    console.log(`📊 Found user ${user.name} with ${userProgress.length} progress entries`);
    
    // Calculate basic metrics
    const completedLessons = userProgress.filter(p => p.completed).length;
    const totalStars = userProgress.reduce((sum, p) => sum + (p.stars || 0), 0);
    const totalPoints = userProgress.reduce((sum, p) => sum + (p.points || 0), 0);
    const hintsUsed = userProgress.reduce((sum, p) => sum + (p.hintsUsed || 0), 0);
    
    // Calculate study days from diary or progress dates
    const studyDates = new Set();
    
    // Add dates from diary entries
    if (user.diary && user.diary.length > 0) {
      user.diary.forEach(entry => {
        if (entry.date) {
          studyDates.add(new Date(entry.date).toDateString());
        }
      });
    }
    
    // Add dates from progress entries
    userProgress.forEach(progress => {
      if (progress.updatedAt) {
        studyDates.add(new Date(progress.updatedAt).toDateString());
      }
    });
    
    const studyDays = studyDates.size;
    
    // Calculate streak (consecutive days from diary)
    let streakDays = 0;
    if (user.diary && user.diary.length > 0) {
      const sortedDiary = user.diary
        .filter(entry => entry.date)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      
      const today = new Date();
      let currentDate = new Date(today);
      currentDate.setHours(0, 0, 0, 0);
      
      for (const entry of sortedDiary) {
        const entryDate = new Date(entry.date);
        entryDate.setHours(0, 0, 0, 0);
        
        const diffDays = Math.floor((currentDate - entryDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0 || diffDays === 1) {
          streakDays++;
          currentDate = new Date(entryDate);
        } else {
          break;
        }
      }
    }
    
    // Calculate time-based metrics
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const weeklyLessons = userProgress.filter(p => 
      p.completed && p.updatedAt && new Date(p.updatedAt) >= oneWeekAgo
    ).length;
    
    const monthlyLessons = userProgress.filter(p => 
      p.completed && p.updatedAt && new Date(p.updatedAt) >= oneMonthAgo
    ).length;
    
    // Calculate average points per day
    const avgPointsPerDay = studyDays > 0 ? Math.round(totalPoints / studyDays) : 0;
    
    // Calculate average study time from diary
    let averageTime = '0 мин';
    if (user.diary && user.diary.length > 0) {
      const totalMinutes = user.diary.reduce((sum, entry) => sum + (entry.studyMinutes || 0), 0);
      const avgMinutes = Math.round(totalMinutes / user.diary.length);
      averageTime = `${avgMinutes} мин`;
    }
    
    // Find most active day of week
    let mostActiveDay = null;
    if (user.diary && user.diary.length > 0) {
      const dayCount = {};
      const dayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
      
      user.diary.forEach(entry => {
        if (entry.date && entry.studyMinutes > 0) {
          const dayOfWeek = new Date(entry.date).getDay();
          dayCount[dayOfWeek] = (dayCount[dayOfWeek] || 0) + entry.studyMinutes;
        }
      });
      
      let maxMinutes = 0;
      let maxDay = null;
      Object.entries(dayCount).forEach(([day, minutes]) => {
        if (minutes > maxMinutes) {
          maxMinutes = minutes;
          maxDay = parseInt(day);
        }
      });
      
      if (maxDay !== null) {
        mostActiveDay = dayNames[maxDay];
      }
    }
    
    // Get recent activity (last 10 completed lessons)
    const recentActivity = userProgress
      .filter(p => p.completed && p.updatedAt)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 10)
      .map(p => ({
        date: p.updatedAt,
        lesson: `Урок ${p.lessonId}`,
        points: p.points || 0,
        duration: Math.floor(Math.random() * 45) + 15 // Mock duration since we don't track it
      }));
    
    // Get subject progress
    const lessons = await Lesson.find({});
    const topicMap = {};
    
    lessons.forEach(lesson => {
      if (lesson.topicId && lesson.topic) {
        const topicIdStr = lesson.topicId.toString();
        
        if (!topicMap[topicIdStr]) {
          topicMap[topicIdStr] = {
            name: lesson.topic,
            total: 0,
            completed: 0
          };
        }
        topicMap[topicIdStr].total++;
      }
    });
    
    // Count completed lessons per topic
    userProgress.forEach(progress => {
      if (progress.completed && progress.lessonId) {
        const lesson = lessons.find(l => l._id.toString() === progress.lessonId.toString());
        if (lesson && lesson.topicId) {
          const topicIdStr = lesson.topicId.toString();
          if (topicMap[topicIdStr]) {
            topicMap[topicIdStr].completed++;
          }
        }
      }
    });
    
    const subjects = Object.values(topicMap).map(topic => ({
      name: topic.name,
      progress: topic.total > 0 ? Math.round((topic.completed / topic.total) * 100) : 0
    }));
    
    // Generate knowledge growth chart (mock data for now)
    const knowledgeChart = Array.from({ length: 12 }, (_, i) => {
      const baseValue = Math.max(0, totalPoints - (11 - i) * 50);
      return Math.floor(baseValue + Math.random() * 100);
    });
    
    // Data quality assessment
    const dataQuality = {
      hasActivityData: user.diary && user.diary.length > 0,
      hasSubjectData: subjects.length > 0,
      validDates: studyDays
    };
    
    const analyticsData = {
      // Basic stats
      studyDays,
      totalDays: studyDays, // For compatibility
      completedSubjects: subjects.filter(s => s.progress === 100).length,
      totalSubjects: subjects.length,
      totalLessonsDone: completedLessons,
      
      // Time-based metrics
      weeklyLessons,
      monthlyLessons,
      streakDays,
      averageTime,
      
      // Points and performance
      totalPoints,
      totalStars,
      hintsUsed,
      avgPointsPerDay,
      
      // Charts and progress
      knowledgeChart,
      subjects,
      
      // Activity patterns
      mostActiveDay,
      recentActivity,
      
      // Metadata
      lastUpdated: new Date().toISOString(),
      dataQuality
    };
    
    console.log('✅ Analytics calculated successfully:', {
      studyDays,
      completedLessons,
      totalPoints,
      subjects: subjects.length
    });
    
    res.json({
      success: true,
      data: analyticsData,
      message: '✅ Analytics loaded successfully'
    });
    
  } catch (error) {
    console.error('❌ Error fetching analytics:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Error fetching analytics',
      details: error.message 
    });
  }
});

// POST endpoint for analytics (keeping for compatibility)
router.post('/:firebaseId/analytics', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  console.log('📊 Analytics POST request received for user:', req.params.firebaseId);
  
  try {
    // For now, just call the GET handler
    return router.handle(
      { ...req, method: 'GET' }, 
      res, 
      () => {}
    );
    
  } catch (error) {
    console.error('❌ Analytics POST error:', error);
    res.status(500).json({ 
      success: false,
      error: '❌ Error processing analytics',
      details: error.message 
    });
  }
});

router.get('/:firebaseId/points', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const progress = await UserProgress.find({ userId: req.params.firebaseId });
    const totalPoints = progress.reduce((sum, p) => sum + (p.points || 0), 0);
    res.json({ totalPoints });
  } catch {
    res.status(500).json({ error: '❌ Error fetching points' });
  }
});

// Fixed diary route section in userRoutes.js

// Diary
router.get('/:firebaseId/diary', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    res.json(user.diary || []);
  } catch (error) {
    console.error('❌ Diary fetch error:', error);
    res.status(500).json({ error: '❌ Error fetching diary' });
  }
});

router.post('/:firebaseId/diary', validateFirebaseId, verifyToken, verifyOwnership, async (req, res) => {
  const { date, studyMinutes, completedTopics, averageGrade } = req.body;
  
  // Log the incoming data for debugging
  console.log('📥 Diary entry data:', { date, studyMinutes, completedTopics, averageGrade });
  
  // More flexible validation - allow 0 values
  if (!date) {
    console.error('❌ Missing date in diary entry');
    return res.status(400).json({ error: '❌ Missing date' });
  }
  
  // Convert to numbers and provide defaults
  const studyMinutesNum = Number(studyMinutes) || 0;
  const completedTopicsNum = Number(completedTopics) || 0;
  const averageGradeNum = Number(averageGrade) || 0;
  
  // Validate that the numbers are reasonable
  if (studyMinutesNum < 0 || studyMinutesNum > 1440) { // Max 24 hours
    return res.status(400).json({ error: '❌ Invalid study minutes (0-1440)' });
  }
  
  if (completedTopicsNum < 0 || completedTopicsNum > 100) { // Reasonable limit
    return res.status(400).json({ error: '❌ Invalid completed topics (0-100)' });
  }
  
  if (averageGradeNum < 0 || averageGradeNum > 100) { // 0-100 grade scale
    return res.status(400).json({ error: '❌ Invalid average grade (0-100)' });
  }
  
  try {
    const user = await User.findOne({ firebaseId: req.params.firebaseId });
    if (!user) return res.status(404).json({ error: '❌ User not found' });
    
    user.diary ||= [];
    
    // Check if entry for this date already exists
    const existingEntryIndex = user.diary.findIndex(entry => {
      const entryDate = new Date(entry.date).toDateString();
      const newDate = new Date(date).toDateString();
      return entryDate === newDate;
    });
    
    const diaryEntry = {
      date: new Date(date),
      studyMinutes: studyMinutesNum,
      completedTopics: completedTopicsNum,
      averageGrade: averageGradeNum
    };
    
    if (existingEntryIndex >= 0) {
      // Update existing entry
      user.diary[existingEntryIndex] = diaryEntry;
      console.log('📝 Updated existing diary entry for date:', date);
    } else {
      // Add new entry
      user.diary.push(diaryEntry);
      console.log('📝 Added new diary entry for date:', date);
    }
    
    await user.save();
    res.status(201).json({ 
      message: '✅ Saved diary entry', 
      diary: user.diary,
      entry: diaryEntry
    });
  } catch (error) {
    console.error('❌ Diary save error:', error);
    res.status(500).json({ 
      error: '❌ Error saving diary', 
      details: error.message 
    });
  }
});

// Homework
router.get('/:firebaseId/homeworks', validateFirebaseId, verifyToken, verifyOwnership, homeworkController.getAllHomeworks);
router.get('/:firebaseId/homeworks/lesson/:lessonId', validateFirebaseId, verifyToken, verifyOwnership, homeworkController.getHomeworkByLesson);
router.post('/:firebaseId/homeworks/save', validateFirebaseId, verifyToken, verifyOwnership, homeworkController.saveHomework);
router.post('/:firebaseId/homeworks/lesson/:lessonId/submit', validateFirebaseId, verifyToken, verifyOwnership, homeworkController.submitHomework);

// Tests
router.get('/:firebaseId/tests', validateFirebaseId, verifyToken, verifyOwnership, testController.getAvailableTests);
router.get('/:firebaseId/tests/:testId', validateFirebaseId, verifyToken, verifyOwnership, testController.getTestById);
router.post('/:firebaseId/tests/:testId/submit', validateFirebaseId, verifyToken, verifyOwnership, testController.submitTestResult);
router.get('/:firebaseId/tests/:testId/result', validateFirebaseId, verifyToken, verifyOwnership, testController.getTestResult);

module.exports = router;