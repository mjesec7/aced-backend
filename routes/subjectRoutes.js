const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Subject = require('../models/subject');
const verifyToken = require('../middlewares/authMiddleware');

// 🔍 Validate ObjectId middleware
function validateObjectId(req, res, next) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: '❌ Invalid ID format' });
  }
  next();
}

// ✅ GET all subjects (public)
router.get('/', async (req, res) => {
  try {
    const subjects = await Subject.find().sort({ createdAt: -1 });
    res.status(200).json(subjects);
  } catch (err) {
    console.error('❌ Error fetching subjects:', err);
    res.status(500).json({ message: '❌ Failed to fetch subjects' });
  }
});

// ✅ GET one subject by ID (optional)
router.get('/:id', validateObjectId, async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);
    if (!subject) return res.status(404).json({ message: '❌ Subject not found' });
    res.status(200).json(subject);
  } catch (err) {
    console.error('❌ Error fetching subject:', err);
    res.status(500).json({ message: '❌ Failed to fetch subject' });
  }
});

// ✅ POST new subject (🔒 protected)
router.post('/', verifyToken, async (req, res) => {
  const { name, icon } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: '❌ Subject name is required and must be a string' });
  }

  try {
    const exists = await Subject.findOne({ name: name.trim() });
    if (exists) {
      return res.status(409).json({ message: '❌ Subject already exists' });
    }

    const newSubject = new Subject({
      name: name.trim(),
      icon: icon || null
    });

    const saved = await newSubject.save();
    res.status(201).json({
      message: '✅ Subject saved successfully',
      subject: saved
    });
  } catch (err) {
    console.error('❌ Error saving subject:', err);
    res.status(500).json({
      message: '❌ Failed to save subject',
      error: err.message
    });
  }
});

// ✅ PUT to update subject (🔒 protected)
router.put('/:id', verifyToken, validateObjectId, async (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: '❌ Name is required and must be a string' });
  }

  try {
    const updated = await Subject.findByIdAndUpdate(
      req.params.id,
      { name: name.trim() },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: '❌ Subject not found' });
    }

    res.status(200).json(updated);
  } catch (err) {
    console.error('❌ Failed to update subject:', err);
    res.status(500).json({ message: '❌ Error updating subject' });
  }
});

// ✅ DELETE a subject (🔒 protected)
router.delete('/:id', verifyToken, validateObjectId, async (req, res) => {
  try {
    const deleted = await Subject.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: '❌ Subject not found' });
    }

    res.status(204).end();
  } catch (err) {
    console.error('❌ Failed to delete subject:', err);
    res.status(500).json({ message: '❌ Error deleting subject' });
  }
});

// ✅ DEBUG: view all (optional)
router.get('/debug/all', verifyToken, async (req, res) => {
  try {
    const subjects = await Subject.find();
    res.status(200).json(subjects);
  } catch (err) {
    console.error('❌ Failed to debug subjects:', err);
    res.status(500).json({ message: '❌ Ошибка при получении предметов' });
  }
});

module.exports = router;
