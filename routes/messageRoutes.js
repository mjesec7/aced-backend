// routes/messageRoutes.js - Inbox/Messages API Routes
const express = require('express');
const router = express.Router();

// --- Model Imports ---
const Message = require('../models/message');
const User = require('../models/user');

// --- Middleware ---
const authMiddleware = require('../middlewares/authMiddleware');

// ============================================
// Helper function to find user
// ============================================
const findUserByIdentifier = async (identifier) => {
    let user = null;

    // Try Firebase ID first (longer than 20 chars usually)
    if (identifier.length >= 20 && !identifier.match(/^[0-9a-fA-F]{24}$/)) {
        user = await User.findOne({ firebaseId: identifier });
    }
    // Try MongoDB ObjectId
    else if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
        user = await User.findById(identifier);
    }
    // Try email
    else if (identifier.includes('@') && identifier.includes('.')) {
        user = await User.findOne({ email: identifier });
    }
    // Fallback: try multiple strategies
    else {
        user = await User.findOne({
            $or: [
                { firebaseId: identifier },
                { email: identifier },
                { Login: identifier }
            ]
        });
    }

    return user;
};

// ============================================
// GET /api/messages/:userId - Get all messages for a user
// ============================================
router.get('/:userId', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const {
            limit = 50,
            skip = 0,
            type,
            unreadOnly = false
        } = req.query;

        // Find user to get both userId and firebaseId
        const user = await findUserByIdentifier(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Get messages using static method
        const messages = await Message.getMessagesForUser(user._id, {
            limit: parseInt(limit),
            skip: parseInt(skip),
            type: type || null,
            unreadOnly: unreadOnly === 'true' || unreadOnly === true
        });

        // Get unread count
        const unreadCount = await Message.getUnreadCount(user._id);

        res.json({
            success: true,
            data: messages,
            pagination: {
                limit: parseInt(limit),
                skip: parseInt(skip),
                total: messages.length,
                unreadCount
            }
        });

    } catch (error) {
        console.error('❌ Error fetching messages:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch messages',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// POST /api/messages/:userId - Create a message for a user
// ============================================
router.post('/:userId', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const { type, title, content, data, priority } = req.body;

        // Validate required fields
        if (!title || !content) {
            return res.status(400).json({
                success: false,
                error: 'Title and content are required'
            });
        }

        // Find user
        const user = await findUserByIdentifier(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Create message
        const message = new Message({
            userId: user._id,
            firebaseId: user.firebaseId,
            type: type || 'info',
            title,
            content,
            data: data || {},
            priority: priority || 'normal'
        });

        await message.save();

        res.status(201).json({
            success: true,
            data: message,
            message: 'Message created successfully'
        });

    } catch (error) {
        console.error('❌ Error creating message:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create message',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// POST /api/messages/:userId/payment - Create payment confirmation message
// ============================================
router.post('/:userId/payment', async (req, res) => {
    try {
        const { userId } = req.params;
        const paymentData = req.body;

        // Find user
        const user = await findUserByIdentifier(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Create payment message using static method
        const message = await Message.createPaymentMessage(
            user._id,
            user.firebaseId,
            paymentData
        );

        res.status(201).json({
            success: true,
            data: message,
            message: 'Payment confirmation message created'
        });

    } catch (error) {
        console.error('❌ Error creating payment message:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create payment message',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// PUT /api/messages/:userId/:messageId/read - Mark single message as read
// ============================================
router.put('/:userId/:messageId/read', authMiddleware, async (req, res) => {
    try {
        const { userId, messageId } = req.params;

        // Find user
        const user = await findUserByIdentifier(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Find and update message
        const message = await Message.findOne({
            _id: messageId,
            $or: [
                { userId: user._id },
                { firebaseId: user.firebaseId }
            ]
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }

        await message.markAsRead();

        res.json({
            success: true,
            data: message,
            message: 'Message marked as read'
        });

    } catch (error) {
        console.error('❌ Error marking message as read:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark message as read',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// PUT /api/messages/:userId/read-all - Mark all messages as read
// ============================================
router.put('/:userId/read-all', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        // Find user
        const user = await findUserByIdentifier(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Mark all as read
        const result = await Message.markAllAsRead(user._id);

        res.json({
            success: true,
            data: {
                modifiedCount: result.modifiedCount
            },
            message: `${result.modifiedCount} messages marked as read`
        });

    } catch (error) {
        console.error('❌ Error marking all messages as read:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark all messages as read',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// DELETE /api/messages/:userId/:messageId - Delete a message
// ============================================
router.delete('/:userId/:messageId', authMiddleware, async (req, res) => {
    try {
        const { userId, messageId } = req.params;

        // Find user
        const user = await findUserByIdentifier(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Find and delete message
        const message = await Message.findOneAndDelete({
            _id: messageId,
            $or: [
                { userId: user._id },
                { firebaseId: user.firebaseId }
            ]
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }

        res.json({
            success: true,
            message: 'Message deleted successfully'
        });

    } catch (error) {
        console.error('❌ Error deleting message:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete message',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// GET /api/messages/:userId/unread-count - Get unread message count
// ============================================
router.get('/:userId/unread-count', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        // Find user
        const user = await findUserByIdentifier(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Get unread count
        const unreadCount = await Message.getUnreadCount(user._id);

        res.json({
            success: true,
            data: {
                unreadCount
            }
        });

    } catch (error) {
        console.error('❌ Error getting unread count:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get unread count',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// DELETE /api/messages/:userId/all - Delete all messages for a user (admin)
// ============================================
router.delete('/:userId/all', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        // Find user
        const user = await findUserByIdentifier(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Delete all messages
        const result = await Message.deleteMany({
            $or: [
                { userId: user._id },
                { firebaseId: user.firebaseId }
            ]
        });

        res.json({
            success: true,
            data: {
                deletedCount: result.deletedCount
            },
            message: `${result.deletedCount} messages deleted`
        });

    } catch (error) {
        console.error('❌ Error deleting all messages:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete all messages',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================
// Error handler for this router
// ============================================
router.use((error, req, res, next) => {
    console.error('❌ Message route error:', error);

    const statusCode = error.status || error.statusCode || 500;
    const message = error.message || 'Internal server error in message routes';

    if (error.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Validation error',
            details: Object.values(error.errors).map(err => err.message)
        });
    }

    if (error.name === 'CastError') {
        return res.status(400).json({
            success: false,
            error: 'Invalid ID format'
        });
    }

    res.status(statusCode).json({
        success: false,
        error: message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
});

module.exports = router;
