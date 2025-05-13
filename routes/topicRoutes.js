const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Topic = require('../models/topic');
const Lesson = require('../models/lesson');

// ✅ Validate ObjectId
function validateObjectId(req, res, next) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    console.warn(`⚠️ Invalid ObjectId: ${req.params.id}`);
    return res.status(400).json({ message: '❌ Invalid ID format' });
  }
  next();
}

// =============================
// ✅ GET all topics
// =============================
router.get('/', async (req, res) => {
  try {
    const topics = await Topic.find();
    console.log(`📤 [GET /topics] Returned ${topics.length} topics`);
    res.json(topics);
  } catch (err) {
    console.error('❌ Error fetching topics:', err);
    res.status(500).json({ message: '❌ Server error' });
  }
});

// =============================
// ✅ POST new topic
// =============================
router.post('/', async (req, res) => {
  const { subject, level, name, description } = req.body;

  if (!subject || !level || !name) {
    return res.status(400).json({ message: '❌ Missing required fields: subject, level, or name' });
  }

  try {
    const existing = await Topic.findOne({ subject, level, 'name.en': name.en });
    if (existing) {
      return res.status(409).json({ message: '⚠️ Topic already exists' });
    }

    const topic = new Topic({ subject, level, name, description });
    const saved = await topic.save();
    console.log(`✅ [POST /topics] Added: ${saved.name.en}`);
    res.status(201).json(saved);
  } catch (err) {
    console.error('❌ Error creating topic:', err);
    res.status(500).json({ message: '❌ Failed to create topic', error: err.message });
  }
});

// =============================
// ✅ GET topic by ID with lessons
// =============================
router.get('/:id', validateObjectId, async (req, res) => {
  try {
    const topic = await Topic.findById(req.params.id);
    if (!topic) {
      return res.status(404).json({ message: '❌ Topic not found' });
    }

    const lessons = await Lesson.find({ topic: topic._id });
    const fullTopic = {
      ...topic.toObject(),
      lessons: lessons || []
    };

    res.json(fullTopic);
  } catch (err) {
    console.error('❌ Error fetching topic with lessons:', err);
    res.status(500).json({ message: '❌ Server error' });
  }
});

// =============================
// ✅ GET lessons under a topic
// =============================
router.get('/:id/lessons', validateObjectId, async (req, res) => {
  try {
    const lessons = await Lesson.find({ topic: req.params.id });
    console.log(`📥 [GET /topics/${req.params.id}/lessons] Found: ${lessons.length}`);
    res.json(lessons);
  } catch (err) {
    console.error('❌ Error fetching lessons for topic:', err);
    res.status(500).json({ message: '❌ Server error' });
  }
});

module.exports = router;
