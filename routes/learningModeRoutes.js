// routes/learningModeRoutes.js - Dual Mode Learning System Routes

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Lesson = require('../models/lesson');
const PlacementTest = require('../models/placementTest');
const UserProgress = require('../models/userProgress');
const Question = require('../models/question');
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

        // Get subject from request body
        const { subject } = req.body;

        // Validate subject
        const { PLACEMENT_TEST_CONFIG } = require('../constants/learningModes');
        if (!subject || !PLACEMENT_TEST_CONFIG.SUBJECTS.includes(subject)) {
            return res.status(400).json({
                error: 'Invalid subject',
                message: `Please choose one of: ${PLACEMENT_TEST_CONFIG.SUBJECTS.join(', ')}`,
                availableSubjects: PLACEMENT_TEST_CONFIG.SUBJECTS
            });
        }

        // Create new test session with ONLY the chosen subject
        const test = await PlacementTest.create({
            userId: req.params.userId,
            status: 'in_progress',
            startedAt: new Date(),
            config: {
                subjects: [subject], // Only test this ONE subject
                totalQuestions: 20, // Reduced since we're only testing one subject
                timeLimit: 20,
                adaptiveMode: true
            }
        });

        // Get first question (difficulty 1 - start easy!)
        const firstQuestion = await getAdaptiveQuestion(1, subject);

        // Store first question in test (with correctAnswer for server-side tracking)
        test.questions.push({
            questionId: firstQuestion._id,
            subject: subject,
            difficulty: 1, // Start easy!
            questionText: firstQuestion.questionText,
            options: firstQuestion.options,
            correctAnswer: firstQuestion.correctAnswer
        });

        await test.save();

        // Send to frontend WITHOUT correctAnswer
        res.json({
            success: true,
            testId: test._id,
            subject: subject, // Let frontend know which subject
            question: {
                questionText: firstQuestion.questionText,
                options: firstQuestion.options,
                difficulty: firstQuestion.difficulty
            },
            questionNumber: 1,
            totalQuestions: test.config.totalQuestions,
            timeLimit: test.config.timeLimit
        });

    } catch (error) {
        console.error('Error starting placement test:', error);

        // Provide specific error messages for common issues
        if (error.message && error.message.includes('No questions found')) {
            return res.status(503).json({
                error: 'Question bank not initialized',
                message: 'The question database is empty. Please run the seed script: node scripts/seedQuestions.js',
                details: error.message
            });
        }

        res.status(500).json({
            error: 'Failed to start placement test',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * POST /api/learning-mode/placement-test/:testId/answer
 * Submit an answer to a placement test question
 */
router.post('/placement-test/:testId/answer', verifyToken, async (req, res) => {
    try {
        const { answer, timeSpent } = req.body; // answer is index (0-3)
        const test = await PlacementTest.findById(req.params.testId);

        if (!test) {
            return res.status(404).json({ error: 'Test not found' });
        }

        // Get the current question (last question in array)
        const currentQuestionIndex = test.questions.length - 1;
        const currentQuestion = test.questions[currentQuestionIndex];

        // Record answer - answer is the INDEX (0, 1, 2, 3)
        currentQuestion.userAnswer = answer;
        currentQuestion.timeSpent = timeSpent;

        // Check if correct (both are indices)
        currentQuestion.isCorrect = (answer === currentQuestion.correctAnswer);

        // Record usage analytics for the question
        try {
            const questionDoc = await Question.findById(currentQuestion.questionId);
            if (questionDoc) {
                await questionDoc.recordUsage(currentQuestion.isCorrect, timeSpent);
            }
        } catch (err) {
            console.error('Error recording question usage:', err);
            // Non-critical, continue
        }

        // Check if test complete
        if (test.questions.length >= test.config.totalQuestions) {
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
                results: {
                    overallScore: results.overallScore,
                    percentile: results.percentile,
                    recommendedLevel: results.recommendedLevel,
                    confidence: results.confidenceScore,
                    subjectScores: results.subjectScores
                }
            });
        }

        // Get next question based on performance
        const nextDifficulty = test.getNextQuestion(currentQuestion.isCorrect);
        const nextSubject = test.config.subjects[test.questions.length % test.config.subjects.length];

        // Get list of already asked question IDs to avoid repeats
        const askedQuestionIds = test.questions.map(q => q.questionId);
        const nextQuestion = await getAdaptiveQuestion(nextDifficulty, nextSubject, askedQuestionIds);

        if (!nextQuestion) {
            throw new Error('No more questions available');
        }

        // Store question with correctAnswer for backend tracking
        test.questions.push({
            questionId: nextQuestion._id,
            subject: nextSubject,
            difficulty: nextDifficulty,
            questionText: nextQuestion.questionText,
            options: nextQuestion.options,
            correctAnswer: nextQuestion.correctAnswer
        });

        await test.save();

        // Send to frontend WITHOUT correctAnswer
        res.json({
            success: true,
            testComplete: false,
            question: {
                questionText: nextQuestion.questionText,
                options: nextQuestion.options,
                difficulty: nextQuestion.difficulty
            },
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
async function getAdaptiveQuestion(difficulty, subject, excludeIds = []) {
    try {
        // Find questions within difficulty range
        const questions = await Question.find({
            subject: subject,
            difficulty: {
                $gte: Math.max(1, difficulty - 0.5),
                $lte: Math.min(10, difficulty + 0.5)
            },
            isActive: true,
            _id: { $nin: excludeIds }
        });

        if (questions.length === 0) {
            // Fallback to any question for this subject (excluding already asked)
            const fallback = await Question.findOne({
                subject,
                isActive: true,
                _id: { $nin: excludeIds }
            });

            if (!fallback) {
                throw new Error(`No questions found for subject: ${subject}`);
            }
            return fallback;
        }

        // Return random question from available ones
        return questions[Math.floor(Math.random() * questions.length)];
    } catch (error) {
        console.error('Error fetching question:', error);
        throw error;
    }
}

/**
 * Check if an answer is correct
 * @param {Object} question - The question object with correctAnswer
 * @param {Number} answerIndex - The index of the selected answer (0-3)
 * @returns {Boolean} Whether the answer is correct
 */
function checkAnswer(question, answerIndex) {
    if (typeof question.correctAnswer === 'number') {
        return answerIndex === question.correctAnswer;
    }

    // Fallback: if correctAnswer is stored as text
    const selectedOption = question.options[answerIndex];
    return selectedOption === question.correctAnswer;
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
 * POST /api/learning-mode/placement-test/:userId/complete
 * Complete a placement test and save results
 */
router.post('/placement-test/:userId/complete', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const {
            subject,
            totalQuestions,
            correctAnswers,
            wrongAnswers,
            scorePercentage,
            recommendedLevel,
            answers
        } = req.body;

        const user = await User.findOne({ firebaseId: userId });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Calculate level assignment based on score
        let levelAssigned = 1;
        if (scorePercentage >= 90) levelAssigned = 6;
        else if (scorePercentage >= 75) levelAssigned = 5;
        else if (scorePercentage >= 60) levelAssigned = 4;
        else if (scorePercentage >= 45) levelAssigned = 3;
        else if (scorePercentage >= 30) levelAssigned = 2;

        // Create placement test results
        const testResults = {
            overallScore: scorePercentage,
            levelAssigned: levelAssigned,
            percentile: Math.min(99, Math.round(scorePercentage * 1.2)),
            subjects: [{
                name: subject,
                score: scorePercentage,
                recommendedLevel: levelAssigned,
                correctAnswers: correctAnswers,
                totalQuestions: totalQuestions
            }]
        };

        // Record the placement test using the user method
        await user.recordPlacementTest(testResults);

        res.json({
            success: true,
            message: 'Placement test completed successfully',
            results: {
                scorePercentage,
                levelAssigned,
                recommendedLevel,
                subject,
                totalQuestions,
                correctAnswers,
                wrongAnswers
            },
            profile: {
                placementTestTaken: true,
                currentLevelCap: user.schoolProfile.currentLevelCap,
                accessibleLevels: user.schoolProfile.accessibleLevels,
                currentGrade: user.schoolProfile.currentGrade
            }
        });

    } catch (error) {
        console.error('❌ Error completing placement test:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to complete placement test',
            message: error.message
        });
    }
});

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
