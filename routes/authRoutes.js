const express = require('express');
const { verifyToken, protectedRoute } = require('../controllers/authController');

const router = express.Router();

router.get('/protected', verifyToken, protectedRoute);

module.exports = router;
