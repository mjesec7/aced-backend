const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Lesson = require('../models/lesson');
const Topic = require('../models/topic');
const verifyToken = require('../middlewares/authMiddleware');

const {
  addLesson,
  updateLesson,
  deleteLesson,
  getLesson,
  getLessonsByTopic,
  bulkCreateLessons
} = require('../controllers/lessonController');

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

// ─── DELETE: All Lessons (Must come before /:id) ────
router.delete('/all', verifyToken, async (req, res) => {
  try {
    const result = await Lesson.deleteMany({});
    console.log(`🧹 Deleted ${result.deletedCount} lessons`);
    res.status(200).json({ 
      message: `✅ Deleted ${result.deletedCount} lessons`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('❌ Error deleting all lessons:', error);
    res.status(500).json({ 
      message: '❌ Server error clearing lessons', 
      error: error.message 
    });
  }
});

// ✅ NEW: Bulk Create Lessons
router.post('/bulk', verifyToken, bulkCreateLessons);

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
      return res.status(404).json({ message: '❌ Lesson not found' });
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
    res.status(201).json(duplicatedLesson);

  } catch (error) {
    console.error('❌ Error duplicating lesson:', error);
    res.status(500).json({ 
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
      return res.status(404).json({ message: '❌ Lesson not found' });
    }

    console.log(`🔄 Status updated: ${lesson.lessonName}`);
    res.json(lesson);

  } catch (error) {
    console.error('❌ Error updating lesson status:', error);
    res.status(500).json({ 
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
      message: '❌ Server error fetching lessons', 
      error: error.message 
    });
  }
});

// ─── POST: New Lesson (Enhanced) ────────────────────
router.post('/', verifyToken, addLesson);

// ─── GET: Lesson by Subject & Name ──────────────────
router.get('/by-name', async (req, res) => {
  const { subject, name } = req.query;
  if (!subject || !name) {
    return res.status(400).json({ message: '❌ Missing subject or lesson name' });
  }

  try {
    const lessons = await Lesson.find({ 
      subject, 
      lessonName: name,
      isActive: true 
    }).populate('topicId', 'name description');
    
    if (!lessons.length) {
      return res.status(404).json({ message: '❌ Lesson not found' });
    }
    
    res.status(200).json(lessons[0]);
  } catch (error) {
    console.error('❌ Error fetching lesson by name:', error);
    res.status(500).json({ 
      message: '❌ Server error fetching lesson', 
      error: error.message 
    });
  }
});

// ─── GET: Lessons by Topic ID (Enhanced) ────────────
router.get('/topic/:topicId', validateObjectId, getLessonsByTopic);

// ─── GET: Lesson by ID (Enhanced) ───────────────────
router.get('/:id', validateObjectId, getLesson);

// ─── PUT: Update Lesson (Enhanced) ──────────────────
router.put('/:id', verifyToken, validateObjectId, updateLesson);

// ─── DELETE: One Lesson (Enhanced) ──────────────────
router.delete('/:id', verifyToken, validateObjectId, deleteLesson);

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
    
    const response = { lessons };
    
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
    res.status(200).json(counts);
  } catch (error) {
    console.error('❌ Error counting lessons by topic:', error);
    res.status(500).json({ 
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
      exportDate: new Date().toISOString(),
      totalLessons: lessons.length,
      filters: filter,
      lessons
    });

  } catch (error) {
    console.error('❌ Error exporting lessons:', error);
    res.status(500).json({ 
      message: '❌ Export failed', 
      error: error.message 
    });
  }
});

module.exports = router;