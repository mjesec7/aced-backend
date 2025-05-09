// src/routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const { getAIResponse } = require('../controllers/chatController');
const verifyToken = require('../middlewares/authMiddleware'); // ✅ Use consistent middleware

// ✅ POST /api/chat — Protected AI Chat
router.post('/', verifyToken, getAIResponse);

module.exports = router;
