// lessonRoutes.js (FIXED version - Topic schema casting issue resolved)
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const verifyToken = require('../middlewares/authMiddleware');

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
    return res.status(400).json({ message: '❌ Invalid ID format' });
  }
  next();
}

// ✅ FIXED: Helper function to extract string value from multilingual field
const extractStringValue = (field, defaultValue = '') => {
  if (typeof field === 'string') {
    return field.trim();
  }
  if (typeof field === 'object' && field !== null) {
    // Try to get English first, then Russian, then any available value
    return field.en || field.ru || Object.values(field)[0] || defaultValue;
  }
  return defaultValue;
};

// ✅ FIXED: Helper function to create multilingual object
const createMultilingualField = (value) => {
  if (typeof value === 'string') {
    return {
      en: value.trim(),
      ru: value.trim()
    };
  }
  if (typeof value === 'object' && value !== null) {
    return {
      en: value.en || value.ru || '',
      ru: value.ru || value.en || ''
    };
  }
  return { en: '', ru: '' };
};

// ─── DELETE: All Lessons (Must come before /:id) ────
router.delete('/all', verifyToken, async (req, res) => {
  try {
    const result = await Lesson.deleteMany({});
    console.log(`🧹 Deleted ${result.deletedCount} lessons`);
    res.status(200).json({ message: `✅ Deleted ${result.deletedCount} lessons` });
  } catch (error) {
    console.error('❌ Error deleting all lessons:', error);
    res.status(500).json({ message: '❌ Server error clearing lessons', error: error.message });
  }
});

// ─── GET: All Lessons ───────────────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = req.query.type ? { type: req.query.type } : {};
    const lessons = await Lesson.find(filter).populate('topicId', 'name description');
    console.log(`📄 Returned ${lessons.length} lessons (filter: ${JSON.stringify(filter)})`);
    res.status(200).json(lessons);
  } catch (error) {
    console.error('❌ Failed to fetch all lessons:', error);
    res.status(500).json({ message: '❌ Server error fetching lessons', error: error.message });
  }
});

// ─── POST: New Lesson (FIXED VERSION) ───────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      lessonName, subject, level, type, topicId, topic, topicDescription,
      description, explanations, examples, content, hint,
      exerciseGroups, quiz, relatedSubjects, translations,
      explanation, exercises, quizzes, abcExercises,
      homeworkABC, homeworkQA, steps
    } = req.body;

    console.log('📝 Creating lesson with data:', {
      lessonName: typeof lessonName,
      topic: typeof topic,
      topicDescription: typeof topicDescription,
      topicValue: topic,
      topicDescValue: topicDescription
    });

    if (!lessonName || !subject || level === undefined || !type || !description) {
      return res.status(400).json({ message: '❌ Required fields: lessonName, subject, level, type, description' });
    }

    const normalizedExplanations = Array.isArray(explanations)
      ? explanations
      : explanation ? [explanation] : [];

    const normalizedExercises = Array.isArray(exerciseGroups)
      ? exerciseGroups
      : Array.isArray(exercises)
        ? [{ exercises }] : [];

    let normalizedQuiz = [];
    if (Array.isArray(quiz)) normalizedQuiz = [...quiz];
    if (Array.isArray(abcExercises)) normalizedQuiz.push(...abcExercises);
    if (Array.isArray(quizzes)) normalizedQuiz.push(...quizzes);

    const homework = [
      ...(Array.isArray(homeworkABC) ? homeworkABC : []),
      ...(Array.isArray(homeworkQA) ? homeworkQA : []),
      ...(Array.isArray(abcExercises) ? abcExercises : [])
    ];

    let resolvedTopic = null;

    // ✅ FIXED: First try to find existing topic by topicId
    if (topicId && mongoose.Types.ObjectId.isValid(topicId)) {
      try {
        resolvedTopic = await Topic.findById(topicId);
        console.log('✅ Found existing topic by ID:', resolvedTopic?.name);
      } catch (error) {
        console.warn('⚠️ Could not find topic by ID:', error.message);
      }
    }

    // ✅ FIXED: If no topic found by ID, create or find by name
    if (!resolvedTopic) {
      // Extract string values from potentially multilingual fields
      const topicNameString = extractStringValue(topic, '');
      const topicDescString = extractStringValue(topicDescription, '');
      
      console.log('🔍 Topic processing:', {
        originalTopic: topic,
        originalTopicDesc: topicDescription,
        extractedName: topicNameString,
        extractedDesc: topicDescString
      });

      if (!topicNameString) {
        return res.status(400).json({ message: '❌ Topic name is required' });
      }

      // Try to find existing topic by name and subject/level
      resolvedTopic = await Topic.findOne({ 
        subject, 
        level, 
        $or: [
          { name: topicNameString },
          { 'name.en': topicNameString },
          { 'name.ru': topicNameString }
        ]
      });

      // ✅ FIXED: Create new topic with proper schema format
      if (!resolvedTopic) {
        try {
          // First, let's check what the Topic schema expects
          console.log('🏗️ Creating new topic...');
          
          // Create topic data based on the schema expectations
          const topicData = {
            subject,
            level
          };

          // ✅ CRITICAL FIX: Check if the schema expects objects or strings
          // Based on the error, it seems the schema expects strings, not objects
          // Let's save as strings first
          topicData.name = topicNameString;
          topicData.description = topicDescString;

          console.log('📝 Topic data to save:', topicData);

          resolvedTopic = new Topic(topicData);
          await resolvedTopic.save();
          
          console.log(`✅ Created topic "${topicNameString}"`);
        } catch (topicError) {
          console.error('❌ Error creating topic:', topicError);
          
          // If the above failed, maybe the schema expects multilingual objects
          // Let's try the object format
          try {
            console.log('🔄 Retrying with multilingual format...');
            
            const multilingualTopicData = {
              subject,
              level,
              name: createMultilingualField(topic),
              description: createMultilingualField(topicDescription)
            };

            console.log('📝 Multilingual topic data:', multilingualTopicData);

            resolvedTopic = new Topic(multilingualTopicData);
            await resolvedTopic.save();
            
            console.log(`✅ Created multilingual topic "${topicNameString}"`);
          } catch (secondTopicError) {
            console.error('❌ Failed to create topic (both formats):', secondTopicError);
            return res.status(500).json({ 
              message: '❌ Failed to create topic',
              error: secondTopicError.message,
              details: 'Topic schema validation failed. Check Topic model schema.'
            });
          }
        }
      } else {
        console.log(`ℹ️ Reused existing topic "${topicNameString}"`);
      }
    }

    // ✅ FIXED: Extract topic name for lesson
    const lessonTopicName = extractStringValue(resolvedTopic.name || topic);

    const newLesson = new Lesson({
      lessonName: extractStringValue(lessonName),
      subject,
      level,
      type,
      topic: lessonTopicName,
      topicId: resolvedTopic._id,
      description: extractStringValue(description),
      explanations: normalizedExplanations,
      examples: extractStringValue(examples),
      content: extractStringValue(content),
      hint: extractStringValue(hint),
      exerciseGroups: normalizedExercises,
      quiz: normalizedQuiz,
      relatedSubjects: Array.isArray(relatedSubjects) ? relatedSubjects : [],
      translations: typeof translations === 'object' ? translations : {},
      steps: Array.isArray(steps) ? steps : [],
      homework
    });

    const saved = await newLesson.save();
    console.log(`✅ Saved lesson "${saved.lessonName}" with ID: ${saved._id}`);
    res.status(201).json(saved);
    
  } catch (error) {
    console.error('❌ Error saving lesson:', error);
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message,
      path: error.path,
      value: error.value
    });
    
    res.status(500).json({ 
      message: '❌ Server error creating lesson', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ─── GET: Lesson by Subject & Name ──────────────────
router.get('/by-name', async (req, res) => {
  const { subject, name } = req.query;
  if (!subject || !name) {
    return res.status(400).json({ message: '❌ Missing subject or topic name' });
  }

  try {
    const lessons = await Lesson.find({ subject, topic: name }).populate('topicId', 'name description');
    if (!lessons.length) return res.status(404).json({ message: '❌ Lesson not found' });
    res.status(200).json(lessons[0]);
  } catch (error) {
    console.error('❌ Error fetching lesson by name:', error);
    res.status(500).json({ message: '❌ Server error fetching lesson', error: error.message });
  }
});

// ─── GET: Lessons by Topic ID ───────────────────────
router.get('/topic/:topicId', validateObjectId, async (req, res) => {
  const { topicId } = req.params;
  console.log(`📚 Fetching lessons for topic: ${topicId}`);

  try {
    const topicExists = await Topic.findById(topicId);
    if (!topicExists) {
      console.warn(`⚠️ Topic not found: ${topicId}`);
      return res.status(404).json({ 
        message: '❌ Topic not found',
        topicId: topicId 
      });
    }

    const lessons = await Lesson.find({ topicId }).sort({ createdAt: 1 });
    
    console.log(`✅ Found ${lessons.length} lessons for topic ${topicId}`);
    res.status(200).json(lessons);
    
  } catch (error) {
    console.error('❌ Error fetching lessons by topic ID:', error);
    res.status(500).json({ 
      message: '❌ Server error fetching lessons by topic', 
      error: error.message,
      topicId: topicId
    });
  }
});

// ─── GET: Lesson by ID ──────────────────────────────
router.get('/:id', validateObjectId, async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id).populate('topicId', 'name description');
    if (!lesson) {
      console.warn(`⚠️ Lesson not found: ${req.params.id}`);
      return res.status(404).json({ message: '❌ Lesson not found' });
    }
    console.log(`✅ Found lesson: ${lesson.lessonName}`);
    res.status(200).json(lesson);
  } catch (error) {
    console.error('❌ Error fetching lesson by ID:', error);
    res.status(500).json({ message: '❌ Server error fetching lesson', error: error.message });
  }
});

// ─── PUT: Update Lesson ─────────────────────────────
router.put('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    const updates = req.body;
    
    // Handle homework arrays
    if (updates.homeworkABC || updates.homeworkQA || updates.abcExercises) {
      updates.homework = [
        ...(Array.isArray(updates.homeworkABC) ? updates.homeworkABC : []),
        ...(Array.isArray(updates.homeworkQA) ? updates.homeworkQA : []),
        ...(Array.isArray(updates.abcExercises) ? updates.abcExercises : [])
      ];
    }

    const updated = await Lesson.findByIdAndUpdate(
      req.params.id, 
      updates, 
      { new: true, runValidators: true }
    ).populate('topicId', 'name description');
    
    if (!updated) {
      console.warn(`⚠️ Lesson not found for update: ${req.params.id}`);
      return res.status(404).json({ message: '❌ Lesson not found' });
    }
    
    console.log(`✅ Updated lesson: ${updated.lessonName}`);
    res.status(200).json(updated);
  } catch (error) {
    console.error('❌ Error updating lesson:', error);
    res.status(500).json({ message: '❌ Server error updating lesson', error: error.message });
  }
});

// ─── DELETE: One Lesson ─────────────────────────────
router.delete('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    const deleted = await Lesson.findByIdAndDelete(req.params.id);
    if (!deleted) {
      console.warn(`⚠️ Lesson not found for deletion: ${req.params.id}`);
      return res.status(404).json({ message: '❌ Lesson not found' });
    }
    console.log(`✅ Deleted lesson: ${deleted.lessonName}`);
    res.status(200).json({ message: '✅ Lesson deleted successfully', lesson: deleted });
  } catch (error) {
    console.error('❌ Error deleting lesson:', error);
    res.status(500).json({ message: '❌ Server error deleting lesson', error: error.message });
  }
});

// ─── GET: Lessons by Subject ────────────────────────
router.get('/subject/:subject', async (req, res) => {
  const { subject } = req.params;
  console.log(`📚 Fetching lessons for subject: ${subject}`);
  
  try {
    const lessons = await Lesson.find({ subject }).populate('topicId', 'name description');
    console.log(`✅ Found ${lessons.length} lessons for subject ${subject}`);
    res.status(200).json(lessons);
  } catch (error) {
    console.error('❌ Error fetching lessons by subject:', error);
    res.status(500).json({ 
      message: '❌ Server error fetching lessons by subject', 
      error: error.message 
    });
  }
});

// ─── GET: Lessons Count by Topic ────────────────────
router.get('/count/by-topic', async (req, res) => {
  try {
    const counts = await Lesson.aggregate([
      {
        $group: {
          _id: '$topicId',
          count: { $sum: 1 },
          topic: { $first: '$topic' }
        }
      }
    ]);
    
    console.log(`✅ Counted lessons for ${counts.length} topics`);
    res.status(200).json(counts);
  } catch (error) {
    console.error('❌ Error counting lessons by topic:', error);
    res.status(500).json({ 
      message: '❌ Server error counting lessons', 
      error: error.message 
    });
  }
});

module.exports = router;