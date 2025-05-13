const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Topic = require('../models/topic');
const Lesson = require('../models/lesson');

// ✅ Validate ObjectId middleware
function validateObjectId(req, res, next) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: '❌ Invalid topic ID format' });
  }
  next();
}

// ✅ GET all topics
router.get('/', async (req, res) => {
  try {
    const topics = await Topic.find();
    res.json(topics);
  } catch (err) {
    console.error('❌ Error fetching topics:', err);
    res.status(500).json({ message: '❌ Server error' });
  }
});

// ✅ POST new topic
router.post('/', async (req, res) => {
  const { subject, level, name, description } = req.body;
  if (!subject || !level || !name?.en) {
    return res.status(400).json({ message: '❌ Required: subject, level, and name.en' });
  }

  try {
    const exists = await Topic.findOne({ subject, level, 'name.en': name.en });
    if (exists) {
      return res.status(409).json({ message: '⚠️ Topic already exists' });
    }

    const newTopic = new Topic({ subject, level, name, description });
    const saved = await newTopic.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('❌ Error saving topic:', err);
    res.status(500).json({ message: '❌ Failed to create topic' });
  }
});

// ✅ GET single topic with lessons
router.get('/:id', validateObjectId, async (req, res) => {
  try {
    const topic = await Topic.findById(req.params.id);
    if (!topic) {
      return res.status(404).json({ message: '❌ Topic not found' });
    }

    const lessons = await Lesson.find({ topic: topic._id });
    res.json({ ...topic.toObject(), lessons });
  } catch (err) {
    console.error('❌ Error fetching topic:', err);
    res.status(500).json({ message: '❌ Server error' });
  }
});

// ✅ GET lessons for a topic
router.get('/:id/lessons', validateObjectId, async (req, res) => {
  try {
    const lessons = await Lesson.find({ topic: req.params.id });
    res.json(lessons);
  } catch (err) {
    console.error('❌ Error fetching topic lessons:', err);
    res.status(500).json({ message: '❌ Server error' });
  }
});

module.exports = router;
