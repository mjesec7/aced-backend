// routes/seedRoutes.js - Seed route with 200 questions for 10 school subjects

const express = require('express');
const router = express.Router();

// Import questions data - FIXED PATH
const questionsData = require('../seedData/questions');

/**
 * GET /api/seed/init
 * Simple endpoint to seed questions - just visit this URL
 */
router.get('/init', async (req, res) => {
    try {
        // Import Question model
        const Question = require('../models/question');
        
        // Check if questions already exist
        const existingCount = await Question.countDocuments();
        
        if (existingCount > 0) {
            return res.json({
                success: true,
                message: `✅ Database already has ${existingCount} questions. No need to seed.`,
                count: existingCount,
                subjects: await Question.distinct('subject')
            });
        }

        // Insert all questions
        const result = await Question.insertMany(questionsData);

        // Get statistics
        const stats = await Question.aggregate([
            { $group: { _id: '$subject', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            message: '✅ Questions seeded successfully!',
            totalInserted: result.length,
            bySubject: stats
        });

    } catch (error) {
        console.error('Seed error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to seed questions',
            message: error.message
        });
    }
});

/**
 * GET /api/seed/status
 * Check current status of questions in database
 */
router.get('/status', async (req, res) => {
    try {
        const Question = require('../models/question');
        
        const count = await Question.countDocuments();
        const bySubject = await Question.aggregate([
            { $group: { _id: '$subject', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        
        res.json({
            success: true,
            hasQuestions: count > 0,
            totalQuestions: count,
            subjects: bySubject,
            message: count > 0 
                ? `✅ Database has ${count} questions across ${bySubject.length} subjects` 
                : '❌ Database is empty - visit /api/seed/init to seed'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/seed/clear
 * Clear all questions from database (use with caution!)
 */
router.delete('/clear', async (req, res) => {
    try {
        const Question = require('../models/question');

        const result = await Question.deleteMany({});

        res.json({
            success: true,
            message: `✅ Deleted ${result.deletedCount} questions`,
            deletedCount: result.deletedCount
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
