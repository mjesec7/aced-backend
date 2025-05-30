const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Topic = require('../models/topic');
const Lesson = require('../models/lesson');

// ✅ Validate MongoDB ObjectId
function validateObjectId(req, res, next) {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    console.warn(`⚠️ Invalid ObjectId: ${id}`);
    return res.status(400).json({ message: '❌ Invalid topic ID format' });
  }
  next();
}

// ─── [GET] All Topics ───────────────────────────────
router.get('/', async (req, res) => {
  console.log('📥 [GET] /topics');
  try {
    const topics = await Topic.find();
    console.log(`📦 Returned ${topics.length} topics`);
    res.json(topics);
  } catch (err) {
    console.error('❌ Failed to fetch topics:', err);
    res.status(500).json({ message: '❌ Server error while fetching topics' });
  }
});

// ─── [POST] Create New Topic ─────────────────────────
router.post('/', async (req, res) => {
  console.log('📥 [POST] /topics', req.body);
  const { subject, level, name, description } = req.body;

  if (!subject || !level || !name?.en) {
    console.warn('⚠️ Missing required: subject, level, name.en');
    return res.status(400).json({ message: '❌ Required fields: subject, level, name.en' });
  }

  try {
    const duplicate = await Topic.findOne({ subject, level, 'name.en': name.en });
    if (duplicate) {
      console.warn(`⚠️ Topic already exists: ${name.en}`);
      return res.status(409).json({ message: '⚠️ Topic with this name already exists' });
    }

    const newTopic = new Topic({ subject, level, name, description });
    const saved = await newTopic.save();
    console.log(`✅ Created topic "${saved.name.en}" (ID: ${saved._id})`);
    res.status(201).json(saved);
  } catch (err) {
    console.error('❌ Failed to create topic:', err);
    res.status(500).json({ message: '❌ Server error while creating topic' });
  }
});

// ─── [GET] Single Topic + Lessons ────────────────────
router.get('/:id', validateObjectId, async (req, res) => {
  const id = req.params.id;
  console.log(`📥 [GET] /topics/${id}`);
  try {
    const topic = await Topic.findById(id);
    if (!topic) {
      console.warn(`⚠️ Topic not found: ${id}`);
      return res.status(404).json({ message: '❌ Topic not found' });
    }

    const lessons = await Lesson.find({ topicId: id });
    console.log(`📘 Topic "${topic.name.en}" has ${lessons.length} lessons`);

    // Inject topicId into each lesson for frontend use
    const lessonsWithTopicId = lessons.map(lesson => ({
      ...lesson.toObject(),
      topicId: id
    }));

    res.json({
      ...topic.toObject(),
      lessons: lessonsWithTopicId,
    });
  } catch (err) {
    console.error('❌ Failed to fetch topic and lessons:', err);
    res.status(500).json({ message: '❌ Server error while fetching topic data' });
  }
});

// ─── [GET] Lessons for Topic ─────────────────────────
router.get('/:id/lessons', validateObjectId, async (req, res) => {
  const id = req.params.id;
  console.log(`📥 [GET] /topics/${id}/lessons`);
  try {
    const exists = await Topic.exists({ _id: id });
    if (!exists) {
      console.warn(`⚠️ No topic for ID: ${id}`);
      return res.status(404).json({ message: '❌ Topic not found' });
    }

    const lessons = await Lesson.find({ topicId: id });
    console.log(`📚 Found ${lessons.length} lessons for topic ID ${id}`);

    // Inject topicId into each lesson for frontend use
    const lessonsWithTopicId = lessons.map(lesson => ({
      ...lesson.toObject(),
      topicId: id
    }));

    res.json(lessonsWithTopicId);
  } catch (err) {
    console.error('❌ Failed to fetch lessons by topic:', err);
    res.status(500).json({ message: '❌ Server error while fetching lessons' });
  }
});

module.exports = router;
