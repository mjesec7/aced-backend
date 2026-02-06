// routes/courseProgressRoutes.js
const express = require('express');
const router = express.Router();
const authenticateUser = require('../middlewares/authMiddleware');
const courseProgressController = require('../controllers/courseProgressController');

// All routes require authentication
router.use(authenticateUser);

// POST /api/course-progress - Save/update course progress
router.post('/', courseProgressController.saveOrUpdateProgress);

// POST /api/course-progress/complete-lesson - Mark a lesson as completed
router.post('/complete-lesson', courseProgressController.completeLesson);

// GET /api/course-progress/user/:userId - Get all course progress for a user
router.get('/user/:userId', courseProgressController.getUserCourseProgress);

// GET /api/course-progress/user/:userId/map - Get progress map for course cards
router.get('/user/:userId/map', courseProgressController.getUserProgressMap);

// GET /api/course-progress/user/:userId/analytics - Get course analytics
router.get('/user/:userId/analytics', courseProgressController.getUserCourseAnalytics);

// GET /api/course-progress/user/:userId/course/:courseId - Get specific course progress
router.get('/user/:userId/course/:courseId', courseProgressController.getCourseProgress);

// DELETE /api/course-progress/user/:userId/course/:courseId - Reset course progress
router.delete('/user/:userId/course/:courseId', courseProgressController.resetCourseProgress);

module.exports = router;
