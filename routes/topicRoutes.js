const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Topic = require('../models/topic');
const Lesson = require('../models/lesson');

// ✅ Middleware to validate MongoDB ObjectId
function validateObjectId(req, res, next) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    console.warn(`⚠️ Invalid ObjectId: ${req.params.id}`);
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

// ✅ GET topic and related lessons (fallback to {} if not found)
router.get('/:id', validateObjectId, async (req, res) => {
  try {
    const topic = await Topic.findById(req.params.id);
    if (!topic) {
      console.warn(`⚠️ Topic not found for ID: ${req.params.id}`);
      return res.json({});
    }

    const lessons = await Lesson.find({ topicId: req.params.id });
    const response = {
      ...topic.toObject(),
      lessons
    };

    res.json(response);
  } catch (err) {
    console.error('❌ Error fetching topic with lessons:', err);
    res.status(500).json({ message: '❌ Server error while fetching topic and lessons' });
  }
});

// ✅ GET only lessons by topic ID (fallback to empty array)
router.get('/:id/lessons', validateObjectId, async (req, res) => {
  try {
    const topicExists = await Topic.exists({ _id: req.params.id });
    if (!topicExists) {
      console.warn(`⚠️ Topic ID not valid or not found: ${req.params.id}`);
      return res.json([]);
    }

    const lessons = await Lesson.find({ topicId: req.params.id });
    res.json(lessons);
  } catch (err) {
    console.error('❌ Error fetching topic lessons:', err);
    res.status(500).json({ message: '❌ Server error while fetching lessons' });
  }
});

module.exports = router;
