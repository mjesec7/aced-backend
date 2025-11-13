// routes/learningModeRoutes.js - Dual Mode Learning System Routes

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Lesson = require('../models/lesson');
const PlacementTest = require('../models/placementTest');
const UserProgress = require('../models/userProgress');
const verifyToken = require('../middlewares/authMiddleware');
const { LEARNING_MODES, MODE_LABELS, SCHOOL_SETTINGS } = require('../constants/learningModes');
const platformSettings = require('../config/platformSettings');

// ========================================
// 🎯 MODE SELECTION & MANAGEMENT
// ========================================

/**
 * GET /api/learning-mode/:userId
 * Get current learning mode and profile information
 */
router.get('/:userId', verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseId: req.params.userId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if user can switch modes
        const canSwitch = !user.schoolProfile?.mandatoryCourses?.some(
            c => c.status === 'in_progress'
        );

        res.json({
            success: true,
            currentMode: user.learningMode,
            modeInfo: MODE_LABELS[user.learningMode],
            schoolProfile: user.schoolProfile,
            studyCentreProfile: user.studyCentreProfile,
            canSwitchMode: canSwitch,
            modeHistory: user.modeHistory || [],
            availableModes: MODE_LABELS
        });

    } catch (error) {
        console.error('Error getting learning mode:', error);
        res.status(500).json({
            error: 'Failed to get learning mode',
            message: error.message
        });
    }
});

/**
 * POST /api/learning-mode/:userId/switch
 * Switch between learning modes
 */
router.post('/:userId/switch', verifyToken, async (req, res) => {
    try {
        const { newMode, reason } = req.body;
        const user = await User.findOne({ firebaseId: req.params.userId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Validate mode
        if (!Object.values(LEARNING_MODES).includes(newMode)) {
            return res.status(400).json({
                error: 'Invalid learning mode',
                validModes: Object.values(LEARNING_MODES)
            });
        }

        // Check if user can switch
        if (user.schoolProfile?.mandatoryCourses?.some(c => c.status === 'in_progress')) {
            return res.status(400).json({
                error: 'Cannot switch mode while mandatory courses are in progress',
                inProgressCourses: user.schoolProfile.mandatoryCourses.filter(
                    c => c.status === 'in_progress'
                ).length
            });
        }

        // Perform the switch
        await user.switchMode(newMode, reason);

        res.json({
            success: true,
            newMode: user.learningMode,
            message: `Successfully switched to ${MODE_LABELS[newMode].label}`,
            modeInfo: MODE_LABELS[newMode]
        });

    } catch (error) {
        console.error('Error switching mode:', error);
        res.status(500).json({
            error: 'Failed to switch mode',
            message: error.message
        });
    }
});

// ========================================
// 🎓 PLACEMENT TEST ROUTES
// ========================================

/**
 * POST /api/learning-mode/placement-test/:userId/start
 * Start a new placement test
 */
router.post('/placement-test/:userId/start', verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseId: req.params.userId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.schoolProfile?.placementTestTaken) {
            return res.status(400).json({
                error: 'Placement test already taken',
                results: user.schoolProfile.placementTestResults,
                canRetake: false
            });
        }

        // Create new test session
        const test = await PlacementTest.create({
            userId: req.params.userId,
            status: 'in_progress',
            startedAt: new Date()
        });

        // Get first question (this would connect to a question bank in production)
        const firstQuestion = await getAdaptiveQuestion(5, 'English');

        res.json({
            success: true,
            testId: test._id,
            question: firstQuestion,
            questionNumber: 1,
            totalQuestions: test.config.totalQuestions,
            timeLimit: test.config.timeLimit
        });

    } catch (error) {
        console.error('Error starting placement test:', error);
        res.status(500).json({
            error: 'Failed to start placement test',
            message: error.message
        });
    }
});

/**
 * POST /api/learning-mode/placement-test/:testId/answer
 * Submit an answer to a placement test question
 */
router.post('/placement-test/:testId/answer', verifyToken, async (req, res) => {
    try {
        const { answer, timeSpent } = req.body;
        const test = await PlacementTest.findById(req.params.testId);

        if (!test) {
            return res.status(404).json({ error: 'Test not found' });
        }

        // Get the last question (current question)
        const currentQuestionIndex = test.questions.length - 1;
        const lastQuestion = test.questions[currentQuestionIndex];

        // Record answer
        lastQuestion.userAnswer = answer;
        lastQuestion.timeSpent = timeSpent;
        lastQuestion.isCorrect = checkAnswer(lastQuestion.questionId, answer);

        // Check if test complete
        if (test.questions.length >= test.config.totalQuestions) {
            // Calculate final results
            const results = test.analyzeResults();
            test.results = results;
            test.status = 'completed';
            test.completedAt = new Date();
            await test.save();

            // Update user profile
            const user = await User.findOne({ firebaseId: test.userId });
            await user.recordPlacementTest({
                overallScore: results.overallScore,
                levelAssigned: results.recommendedLevel,
                percentile: results.percentile,
                subjects: results.subjectScores
            });

            return res.json({
                success: true,
                testComplete: true,
                results
            });
        }

        // Get next question based on performance
        const nextDifficulty = test.getNextQuestion(lastQuestion.isCorrect);
        const nextSubject = test.config.subjects[test.questions.length % test.config.subjects.length];
        const nextQuestion = await getAdaptiveQuestion(nextDifficulty, nextSubject);

        test.questions.push({
            questionId: nextQuestion._id,
            subject: nextSubject,
            difficulty: nextDifficulty,
            questionText: nextQuestion.text,
            options: nextQuestion.options,
            correctAnswer: nextQuestion.correctAnswer
        });

        await test.save();

        res.json({
            success: true,
            question: nextQuestion,
            questionNumber: test.questions.length,
            totalQuestions: test.config.totalQuestions,
            progress: (test.questions.length / test.config.totalQuestions) * 100
        });

    } catch (error) {
        console.error('Error submitting answer:', error);
        res.status(500).json({
            error: 'Failed to submit answer',
            message: error.message
        });
    }
});

/**
 * GET /api/learning-mode/placement-test/:userId/results
 * Get placement test results
 */
router.get('/placement-test/:userId/results', verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseId: req.params.userId });

        if (!user || !user.schoolProfile?.placementTestTaken) {
            return res.status(404).json({
                error: 'No placement test results found'
            });
        }

        res.json({
            success: true,
            results: user.schoolProfile.placementTestResults,
            currentLevel: user.schoolProfile.currentLevelCap,
            currentGrade: user.schoolProfile.currentGrade,
            testDate: user.schoolProfile.placementTestDate
        });

    } catch (error) {
        console.error('Error getting placement test results:', error);
        res.status(500).json({
            error: 'Failed to get results',
            message: error.message
        });
    }
});

// ========================================
// 🏫 SCHOOL MODE SPECIFIC ROUTES
// ========================================

/**
 * GET /api/learning-mode/school/:userId/curriculum
 * Get structured curriculum for school mode
 */
router.get('/school/:userId/curriculum', verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseId: req.params.userId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.learningMode !== 'school') {
            return res.status(400).json({ error: 'User not in school mode' });
        }

        // Get structured curriculum based on level
        const curriculum = await generateCurriculum(
            user.schoolProfile.currentLevelCap,
            user.schoolProfile.curriculum
        );

        res.json({
            success: true,
            curriculum,
            currentLevel: user.schoolProfile.currentLevelCap,
            currentGrade: user.schoolProfile.currentGrade,
            completedLevels: user.schoolProfile.completedLevels || [],
            mandatoryCourses: user.schoolProfile.mandatoryCourses || [],
            nextMilestone: getNextMilestone(user.schoolProfile.currentLevelCap)
        });

    } catch (error) {
        console.error('Error getting curriculum:', error);
        res.status(500).json({
            error: 'Failed to get curriculum',
            message: error.message
        });
    }
});

/**
 * POST /api/learning-mode/school/:userId/complete-level
 * Mark a level as completed and unlock next level
 */
router.post('/school/:userId/complete-level', verifyToken, async (req, res) => {
    try {
        const { level, score, certificate } = req.body;
        const user = await User.findOne({ firebaseId: req.params.userId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.learningMode !== 'school') {
            return res.status(400).json({ error: 'User not in school mode' });
        }

        // Verify all requirements met
        const levelRequirements = await checkLevelRequirements(user, level);

        if (!levelRequirements.met) {
            return res.status(400).json({
                error: 'Level requirements not met',
                missing: levelRequirements.missing,
                required: levelRequirements.required
            });
        }

        // Check minimum passing score
        if (score < user.schoolProfile.minPassingScore) {
            return res.status(400).json({
                error: 'Score below passing threshold',
                score,
                required: user.schoolProfile.minPassingScore
            });
        }

        // Mark level as completed
        await user.completeLevel(level, score, certificate);

        // Generate achievement
        const achievement = {
            id: `level-${level}-completed`,
            name: `Level ${level} Mastered!`,
            description: `Completed Level ${level} with ${score}% score`,
            icon: score >= 90 ? '🏆' : score >= 80 ? '🥇' : '✅',
            type: 'level_completion',
            unlockedAt: new Date(),
            data: { level, score, certificate }
        };

        user.achievements = user.achievements || [];
        user.achievements.push(achievement);
        await user.save();

        res.json({
            success: true,
            unlockedLevel: level + 1,
            newGrade: user.schoolProfile.currentGrade,
            achievement,
            certificate,
            message: `Congratulations! Level ${level + 1} is now unlocked!`
        });

    } catch (error) {
        console.error('Error completing level:', error);
        res.status(500).json({
            error: 'Failed to complete level',
            message: error.message
        });
    }
});

/**
 * GET /api/learning-mode/school/:userId/progress
 * Get detailed school mode progress
 */
router.get('/school/:userId/progress', verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseId: req.params.userId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get completed lessons count per level
        const progressByLevel = await UserProgress.aggregate([
            { $match: { userId: req.params.userId, completed: true } },
            {
                $lookup: {
                    from: 'lessons',
                    localField: 'lessonId',
                    foreignField: '_id',
                    as: 'lesson'
                }
            },
            { $unwind: '$lesson' },
            {
                $group: {
                    _id: '$lesson.level',
                    completedCount: { $sum: 1 },
                    avgScore: { $avg: '$score' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            currentLevel: user.schoolProfile?.currentLevelCap || 1,
            currentGrade: user.schoolProfile?.currentGrade || 'A1',
            completedLevels: user.schoolProfile?.completedLevels || [],
            progressByLevel,
            totalPoints: user.totalPoints || 0,
            achievements: user.achievements || []
        });

    } catch (error) {
        console.error('Error getting progress:', error);
        res.status(500).json({
            error: 'Failed to get progress',
            message: error.message
        });
    }
});

// ========================================
// 🌟 STUDY CENTRE SPECIFIC ROUTES
// ========================================

/**
 * POST /api/learning-mode/study-centre/:userId/bookmark
 * Bookmark a course in study centre mode
 */
router.post('/study-centre/:userId/bookmark', verifyToken, async (req, res) => {
    try {
        const { courseId, notes } = req.body;
        const user = await User.findOne({ firebaseId: req.params.userId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        await user.addBookmark(courseId, notes);

        res.json({
            success: true,
            message: 'Course bookmarked successfully',
            bookmarks: user.studyCentreProfile.bookmarkedCourses
        });

    } catch (error) {
        console.error('Error bookmarking course:', error);
        res.status(500).json({
            error: 'Failed to bookmark course',
            message: error.message
        });
    }
});

/**
 * DELETE /api/learning-mode/study-centre/:userId/bookmark/:courseId
 * Remove a bookmark
 */
router.delete('/study-centre/:userId/bookmark/:courseId', verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseId: req.params.userId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user.studyCentreProfile?.bookmarkedCourses) {
            return res.status(404).json({ error: 'No bookmarks found' });
        }

        user.studyCentreProfile.bookmarkedCourses = user.studyCentreProfile.bookmarkedCourses.filter(
            b => b.courseId.toString() !== req.params.courseId
        );

        await user.save();

        res.json({
            success: true,
            message: 'Bookmark removed',
            bookmarks: user.studyCentreProfile.bookmarkedCourses
        });

    } catch (error) {
        console.error('Error removing bookmark:', error);
        res.status(500).json({
            error: 'Failed to remove bookmark',
            message: error.message
        });
    }
});

/**
 * POST /api/learning-mode/study-centre/:userId/create-path
 * Create a personal learning path
 */
router.post('/study-centre/:userId/create-path', verifyToken, async (req, res) => {
    try {
        const { name, description, courses } = req.body;
        const user = await User.findOne({ firebaseId: req.params.userId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        await user.createPersonalPath(name, description, courses);

        res.json({
            success: true,
            message: 'Learning path created successfully',
            paths: user.studyCentreProfile.personalPaths
        });

    } catch (error) {
        console.error('Error creating path:', error);
        res.status(500).json({
            error: 'Failed to create learning path',
            message: error.message
        });
    }
});

/**
 * GET /api/learning-mode/study-centre/:userId/exploration
 * Get exploration history and recommendations
 */
router.get('/study-centre/:userId/exploration', verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseId: req.params.userId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const explorationHistory = user.studyCentreProfile?.explorationHistory || [];
        const bookmarks = user.studyCentreProfile?.bookmarkedCourses || [];
        const personalPaths = user.studyCentreProfile?.personalPaths || [];

        // Get recommendations based on history
        const recommendations = await generateRecommendations(user, explorationHistory);

        res.json({
            success: true,
            explorationHistory: explorationHistory.slice(-20), // Last 20 items
            bookmarks,
            personalPaths,
            recommendations,
            stats: {
                totalExplored: explorationHistory.length,
                totalBookmarks: bookmarks.length,
                totalPaths: personalPaths.length
            }
        });

    } catch (error) {
        console.error('Error getting exploration data:', error);
        res.status(500).json({
            error: 'Failed to get exploration data',
            message: error.message
        });
    }
});

// ========================================
// 🔒 ACCESS CONTROL MIDDLEWARE
// ========================================

/**
 * Middleware to check lesson access based on mode
 */
async function checkLessonAccess(req, res, next) {
    try {
        const { userId, lessonId } = req.params;
        const user = await User.findOne({ firebaseId: userId });
        const lesson = await Lesson.findById(lessonId);

        if (!user || !lesson) {
            return res.status(404).json({ error: 'User or lesson not found' });
        }

        // Check access
        const accessCheck = lesson.canUserAccess(user);

        if (!accessCheck.canAccess) {
            return res.status(403).json({
                error: 'Access denied',
                reason: accessCheck.reason,
                requiredLevel: accessCheck.requiredLevel,
                currentLevel: accessCheck.currentLevel
            });
        }

        // Check prerequisites if needed
        if (accessCheck.checkPrerequisites) {
            const completedLessons = await UserProgress.find({
                userId,
                lessonId: { $in: accessCheck.prerequisiteLessons },
                completed: true
            });

            if (completedLessons.length < accessCheck.prerequisiteLessons.length) {
                return res.status(403).json({
                    error: 'Prerequisites not met',
                    required: accessCheck.prerequisiteLessons.length,
                    completed: completedLessons.length,
                    missing: accessCheck.prerequisiteLessons.filter(
                        prereq => !completedLessons.find(c => c.lessonId.toString() === prereq.toString())
                    )
                });
            }
        }

        // Access granted
        req.accessGranted = true;
        req.user = user;
        req.lesson = lesson;
        next();

    } catch (error) {
        console.error('Error checking lesson access:', error);
        res.status(500).json({
            error: 'Failed to check access',
            message: error.message
        });
    }
}

// ========================================
// 🔧 HELPER FUNCTIONS
// ========================================

/**
 * Generate curriculum for a given level
 */
async function generateCurriculum(currentLevel, curriculumType = 'standard') {
    try {
        const lessons = await Lesson.find({
            level: { $lte: currentLevel },
            status: 'published',
            isActive: true
        })
            .select('lessonName description level difficulty subject topicId')
            .populate('topicId', 'title description')
            .sort({ level: 1, subject: 1 });

        // Group by level
        const curriculum = {};
        lessons.forEach(lesson => {
            if (!curriculum[lesson.level]) {
                curriculum[lesson.level] = {
                    level: lesson.level,
                    grade: platformSettings.levelGradeMapping[lesson.level],
                    lessons: []
                };
            }
            curriculum[lesson.level].lessons.push(lesson);
        });

        return Object.values(curriculum);

    } catch (error) {
        console.error('Error generating curriculum:', error);
        return [];
    }
}

/**
 * Check if level requirements are met
 */
async function checkLevelRequirements(user, level) {
    try {
        const requiredCourses = user.schoolProfile.requiredCoursesPerLevel || 5;

        // Get completed lessons for this level
        const completedLessons = await UserProgress.countDocuments({
            userId: user.firebaseId,
            completed: true,
            lessonId: {
                $in: await Lesson.find({ level }).distinct('_id')
            }
        });

        const met = completedLessons >= requiredCourses;

        return {
            met,
            required: requiredCourses,
            completed: completedLessons,
            missing: met ? 0 : requiredCourses - completedLessons
        };

    } catch (error) {
        console.error('Error checking requirements:', error);
        return { met: false, required: 5, completed: 0, missing: 5 };
    }
}

/**
 * Get adaptive question for placement test
 */
async function getAdaptiveQuestion(difficulty, subject) {
    // This is a placeholder - in production, this would query a question bank
    return {
        _id: new require('mongoose').Types.ObjectId(),
        text: `Sample ${subject} question at difficulty ${difficulty}`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 'Option A',
        subject,
        difficulty
    };
}

/**
 * Check if an answer is correct
 */
function checkAnswer(questionId, answer) {
    // This is a placeholder - in production, this would check against the actual answer
    return Math.random() > 0.5; // 50% correct for demo
}

/**
 * Get next milestone
 */
function getNextMilestone(currentLevel) {
    const milestones = [5, 10, 15, 20];
    const next = milestones.find(m => m > currentLevel);
    return next || 20;
}

/**
 * Generate recommendations
 */
async function generateRecommendations(user, explorationHistory) {
    // Placeholder for recommendation engine
    const popularLessons = await Lesson.find({
        status: 'published',
        isActive: true
    })
        .sort({ 'analytics.totalViews': -1 })
        .limit(5)
        .select('lessonName description level subject');

    return popularLessons;
}

// Export middleware and router
router.checkLessonAccess = checkLessonAccess;
module.exports = router;
