const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Topic = require('../models/topic');
const Lesson = require('../models/lesson');

// ✅ Middleware to validate MongoDB ObjectId
function validateObjectId(req, res, next) {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    console.warn(`⚠️ Invalid ObjectId received in route: ${id}`);
    return res.status(400).json({ message: '❌ Invalid topic ID format' });
  }
  next();
}

// ✅ GET all topics
router.get('/', async (req, res) => {
  console.log('📥 [GET] /topics');
  try {
    const topics = await Topic.find();
    console.log(`📦 Topics returned: ${topics.length}`);
    res.json(topics);
  } catch (err) {
    console.error('❌ Error fetching all topics:', err);
    res.status(500).json({ message: '❌ Server error while fetching topics' });
  }
});

// ✅ POST new topic
router.post('/', async (req, res) => {
  console.log('📥 [POST] /topics', req.body);
  const { subject, level, name, description } = req.body;

  if (!subject || !level || !name?.en) {
    console.warn('❌ Missing required fields: subject, level, or name.en');
    return res.status(400).json({ message: '❌ Required: subject, level, and name.en' });
  }

  try {
    const exists = await Topic.findOne({ subject, level, 'name.en': name.en });
    if (exists) {
      console.warn(`⚠️ Duplicate topic: "${name.en}" already exists`);
      return res.status(409).json({ message: '⚠️ Topic already exists' });
    }

    const newTopic = new Topic({ subject, level, name, description });
    const saved = await newTopic.save();
    console.log(`✅ [Created] Topic "${saved.name}" (ID: ${saved._id})`);
    res.status(201).json(saved);
  } catch (err) {
    console.error('❌ Error saving topic:', err);
    res.status(500).json({ message: '❌ Failed to create topic' });
  }
});

// ✅ GET topic and related lessons
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
    console.log(`📘 Found topic "${topic.name}" with ${lessons.length} lessons`);
    const response = {
      ...topic.toObject(),
      lessons
    };

    res.json(response);
  } catch (err) {
    console.error('❌ Error fetching topic and lessons:', err);
    res.status(500).json({ message: '❌ Server error while fetching topic and lessons' });
  }
});

// ✅ GET only lessons by topic ID
router.get('/:id/lessons', validateObjectId, async (req, res) => {
  const id = req.params.id;
  console.log(`📥 [GET] /topics/${id}/lessons`);
  try {
    const topicExists = await Topic.exists({ _id: id });
    if (!topicExists) {
      console.warn(`⚠️ Topic not found for ID: ${id}`);
      return res.status(404).json({ message: '❌ Topic not found' });
    }

    const lessons = await Lesson.find({ topicId: id });
    console.log(`📚 Lessons found for topic ${id}: ${lessons.length}`);
    res.json(lessons);
  } catch (err) {
    console.error('❌ Error fetching lessons by topic ID:', err);
    res.status(500).json({ message: '❌ Server error while fetching lessons' });
  }
});

module.exports = router;
