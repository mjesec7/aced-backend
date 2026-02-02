const express = require('express');
const router = express.Router();
const UserActivity = require('../models/UserActivity');
const verifyToken = require('../middlewares/authMiddleware');

// Track a new event
router.post('/track', verifyToken, async (req, res) => {
    try {
        const { action, category, metadata, deviceType } = req.body;
        const userId = req.user.uid; // From verifyToken middleware
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];

        const activity = new UserActivity({
            userId,
            action,
            category,
            metadata,
            ipAddress,
            userAgent,
            deviceType
        });

        await activity.save();

        res.status(201).json({ success: true, message: 'Activity tracked' });
    } catch (error) {
        console.error('Tracking error:', error);
        res.status(500).json({ success: false, error: 'Failed to track activity' });
    }
});

// Get user activity (Admin only - simplified check for now)
router.get('/user/:userId', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const activities = await UserActivity.find({ userId })
            .sort({ timestamp: -1 })
            .limit(limit);

        res.json({ success: true, data: activities });
    } catch (error) {
        console.error('Fetch activity error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch activity' });
    }
});

module.exports = router;
