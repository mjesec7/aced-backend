// routes/dashboardRoutes.js - Mode-Differentiated Dashboard Routes

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Lesson = require('../models/lesson');
const UserProgress = require('../models/userProgress');
const verifyToken = require('../middlewares/authMiddleware');
const platformSettings = require('../config/platformSettings');

/**
 * GET /api/dashboard/:userId
 * Get dashboard data based on user's learning mode
 */
router.get('/:userId', verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseId: req.params.userId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.learningMode === 'school') {
            const dashboard = await generateSchoolDashboard(user);
            return res.json({
                success: true,
                mode: 'school',
                dashboard
            });
        }

        if (user.learningMode === 'study_centre') {
            const dashboard = await generateStudyCentreDashboard(user);
            return res.json({
                success: true,
                mode: 'study_centre',
                dashboard
            });
        }

        // Hybrid mode - combine both dashboards
        const schoolDashboard = await generateSchoolDashboard(user);
        const studyCentreDashboard = await generateStudyCentreDashboard(user);

        res.json({
            success: true,
            mode: 'hybrid',
            dashboard: {
                school: schoolDashboard,
                studyCentre: studyCentreDashboard
            }
        });

    } catch (error) {
        console.error('Error getting dashboard:', error);
        res.status(500).json({
            error: 'Failed to get dashboard',
            message: error.message
        });
    }
});

/**
 * GET /api/dashboard/:userId/stats
 * Get overall statistics
 */
router.get('/:userId/stats', verifyToken, async (req, res) => {
    try {
        const user = await User.findOne({ firebaseId: req.params.userId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get overall stats
        const totalLessonsCompleted = await UserProgress.countDocuments({
            userId: req.params.userId,
            completed: true
        });

        const totalLessonsInProgress = await UserProgress.countDocuments({
            userId: req.params.userId,
            completed: false
        });

        const avgScore = await UserProgress.aggregate([
            { $match: { userId: req.params.userId, completed: true } },
            { $group: { _id: null, avgScore: { $avg: '$score' } } }
        ]);

        const totalTimeSpent = await UserProgress.aggregate([
            { $match: { userId: req.params.userId } },
            { $group: { _id: null, totalTime: { $sum: '$timeSpent' } } }
        ]);

        res.json({
            success: true,
            stats: {
                learningMode: user.learningMode,
                totalLessonsCompleted,
                totalLessonsInProgress,
                averageScore: avgScore[0]?.avgScore || 0,
                totalTimeSpent: totalTimeSpent[0]?.totalTime || 0,
                totalPoints: user.totalPoints || 0,
                currentLevel: user.level || 1,
                achievements: user.achievements?.length || 0
            }
        });

    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({
            error: 'Failed to get stats',
            message: error.message
        });
    }
});

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Generate School Mode Dashboard
 */
async function generateSchoolDashboard(user) {
    const currentLevel = user.schoolProfile?.currentLevelCap || 1;
    const currentGrade = user.schoolProfile?.currentGrade || 'A1';

    // Get progress for current level
    const currentLevelProgress = await calculateLevelProgress(user, currentLevel);

    // Get upcoming deadlines
    const upcomingDeadlines = getUpcomingDeadlines(user);

    // Get mandatory courses
    const mandatoryCourses = user.schoolProfile?.mandatoryCourses || [];

    // Get next lessons to complete
    const nextLessons = await Lesson.find({
        level: currentLevel,
        status: 'published',
        isActive: true
    })
        .limit(5)
        .select('lessonName description difficulty estimatedDuration');

    // Calculate rank (placeholder - would need global stats)
    const rank = await calculateRank(user);

    // Get recent achievements
    const recentAchievements = user.achievements?.slice(-5) || [];

    return {
        currentLevel,
        currentGrade,
        gradeLabel: platformSettings.levelGradeMapping[currentLevel],

        progress: {
            completedLevels: user.schoolProfile?.completedLevels?.length || 0,
            currentLevelProgress: currentLevelProgress,
            mandatoryCourses: {
                total: mandatoryCourses.length,
                completed: mandatoryCourses.filter(c => c.status === 'completed').length,
                inProgress: mandatoryCourses.filter(c => c.status === 'in_progress').length,
                notStarted: mandatoryCourses.filter(c => c.status === 'not_started').length
            },
            upcomingDeadlines
        },

        achievements: {
            recent: recentAchievements,
            total: user.achievements?.length || 0,
            totalPoints: user.totalPoints || 0,
            rank
        },

        nextSteps: {
            lessons: nextLessons,
            recommendations: await getStructuredNextSteps(user)
        },

        restrictions: {
            canAccessLevel: currentLevel,
            lockedLevels: await getLockedContent(user),
            nextUnlock: {
                level: currentLevel + 1,
                requirementsRemaining: await getRemainingRequirements(user, currentLevel)
            }
        },

        motivation: {
            message: getMotivationalMessage(currentLevelProgress),
            nextMilestone: getNextMilestone(currentLevel),
            streak: 0 // Would be calculated from daily activity
        }
    };
}

/**
 * Generate Study Centre Dashboard
 */
async function generateStudyCentreDashboard(user) {
    // Get exploration history
    const explorationHistory = user.studyCentreProfile?.explorationHistory || [];
    const recentlyAccessed = explorationHistory.slice(-10);

    // Get bookmarks
    const bookmarks = user.studyCentreProfile?.bookmarkedCourses || [];

    // Get personal paths
    const personalPaths = user.studyCentreProfile?.personalPaths || [];

    // Get recommendations
    const recommendations = await getPersonalizedRecommendations(user);

    // Get trending courses
    const trending = await getTrendingCourses();

    // Get all levels overview
    const allLevelsOverview = await getAllLevelsOverview(user);

    return {
        exploration: {
            totalExplored: explorationHistory.length,
            recentlyAccessed,
            timeThisWeek: calculateWeeklyTime(explorationHistory),
            favoriteSubjects: calculateFavoriteSubjects(explorationHistory)
        },

        bookmarks: {
            total: bookmarks.length,
            items: bookmarks.slice(-5) // Last 5 bookmarks
        },

        personalPaths: {
            total: personalPaths.length,
            paths: personalPaths.map(path => ({
                name: path.name,
                description: path.description,
                progress: path.progress,
                coursesCount: path.courses.length
            }))
        },

        recommendations: {
            forYou: recommendations,
            trending,
            continue: await getContinueLearning(user)
        },

        allLevels: allLevelsOverview,

        freedom: {
            allLevelsAccessible: true,
            noDeadlines: true,
            unlimitedAttempts: true,
            message: 'Explore at your own pace!'
        },

        insights: {
            totalLessonsCompleted: await UserProgress.countDocuments({
                userId: user.firebaseId,
                completed: true
            }),
            averageScore: await getAverageScore(user),
            learningPattern: determineLearningPattern(explorationHistory)
        }
    };
}

/**
 * Calculate level progress
 */
async function calculateLevelProgress(user, level) {
    const requiredCourses = user.schoolProfile?.requiredCoursesPerLevel || 5;

    const completedLessons = await UserProgress.countDocuments({
        userId: user.firebaseId,
        completed: true,
        lessonId: {
            $in: await Lesson.find({ level }).distinct('_id')
        }
    });

    return {
        completed: completedLessons,
        required: requiredCourses,
        percentage: Math.min(100, Math.round((completedLessons / requiredCourses) * 100))
    };
}

/**
 * Get upcoming deadlines
 */
function getUpcomingDeadlines(user) {
    const now = new Date();
    const deadlines = user.schoolProfile?.mandatoryCourses
        ?.filter(c => c.deadline && new Date(c.deadline) > now)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
        .slice(0, 5) || [];

    return deadlines.map(course => ({
        courseId: course.courseId,
        deadline: course.deadline,
        daysRemaining: Math.ceil((new Date(course.deadline) - now) / (1000 * 60 * 60 * 24)),
        status: course.status
    }));
}

/**
 * Calculate user rank
 */
async function calculateRank(user) {
    // Placeholder - would need global statistics
    const totalPoints = user.totalPoints || 0;

    if (totalPoints > 10000) return { rank: 'Diamond', percentile: 95 };
    if (totalPoints > 5000) return { rank: 'Platinum', percentile: 80 };
    if (totalPoints > 2000) return { rank: 'Gold', percentile: 60 };
    if (totalPoints > 500) return { rank: 'Silver', percentile: 40 };
    return { rank: 'Bronze', percentile: 20 };
}

/**
 * Get structured next steps
 */
async function getStructuredNextSteps(user) {
    const currentLevel = user.schoolProfile?.currentLevelCap || 1;

    const recommendations = [];

    // Check if placement test is needed
    if (!user.schoolProfile?.placementTestTaken) {
        recommendations.push({
            type: 'placement_test',
            priority: 'high',
            message: 'Take the placement test to find your optimal starting level'
        });
    }

    // Get incomplete mandatory courses
    const incompleteMandatory = user.schoolProfile?.mandatoryCourses
        ?.filter(c => c.status !== 'completed')
        .slice(0, 3) || [];

    incompleteMandatory.forEach(course => {
        recommendations.push({
            type: 'mandatory_course',
            courseId: course.courseId,
            priority: course.deadline ? 'high' : 'medium',
            message: `Complete mandatory course${course.deadline ? ' (deadline approaching)' : ''}`
        });
    });

    // Suggest next level lessons
    if (recommendations.length < 5) {
        const nextLessons = await Lesson.find({
            level: currentLevel,
            status: 'published'
        }).limit(5 - recommendations.length);

        nextLessons.forEach(lesson => {
            recommendations.push({
                type: 'next_lesson',
                lessonId: lesson._id,
                lessonName: lesson.lessonName,
                priority: 'normal'
            });
        });
    }

    return recommendations;
}

/**
 * Get locked content
 */
async function getLockedContent(user) {
    const currentLevel = user.schoolProfile?.currentLevelCap || 1;
    const lockedLevels = [];

    for (let level = currentLevel + 1; level <= 20; level++) {
        const lessonsCount = await Lesson.countDocuments({ level, status: 'published' });
        if (lessonsCount > 0) {
            lockedLevels.push({
                level,
                grade: platformSettings.levelGradeMapping[level],
                lessonsCount
            });
        }
    }

    return lockedLevels;
}

/**
 * Get remaining requirements for level
 */
async function getRemainingRequirements(user, level) {
    const required = user.schoolProfile?.requiredCoursesPerLevel || 5;
    const completed = await UserProgress.countDocuments({
        userId: user.firebaseId,
        completed: true,
        lessonId: { $in: await Lesson.find({ level }).distinct('_id') }
    });

    return Math.max(0, required - completed);
}

/**
 * Get motivational message
 */
function getMotivationalMessage(progress) {
    const percentage = progress.percentage;

    if (percentage === 100) return "🎉 Level complete! You're ready to move up!";
    if (percentage >= 80) return "💪 Almost there! Keep pushing!";
    if (percentage >= 50) return "🌟 Halfway through! Great progress!";
    if (percentage >= 25) return "🚀 Good start! Keep going!";
    return "👋 Let's begin your learning journey!";
}

/**
 * Get next milestone
 */
function getNextMilestone(currentLevel) {
    const milestones = [5, 10, 15, 20];
    return milestones.find(m => m > currentLevel) || 20;
}

/**
 * Get personalized recommendations
 */
async function getPersonalizedRecommendations(user) {
    // Get user's completed lessons to understand preferences
    const completedProgress = await UserProgress.find({
        userId: user.firebaseId,
        completed: true
    }).populate('lessonId', 'subject difficulty level');

    // Extract favorite subjects
    const subjectCounts = {};
    completedProgress.forEach(p => {
        if (p.lessonId?.subject) {
            subjectCounts[p.lessonId.subject] = (subjectCounts[p.lessonId.subject] || 0) + 1;
        }
    });

    const favoriteSubjects = Object.entries(subjectCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([subject]) => subject);

    // Get recommendations based on favorite subjects
    const recommendations = await Lesson.find({
        subject: { $in: favoriteSubjects },
        status: 'published',
        isActive: true
    })
        .limit(5)
        .select('lessonName description level subject difficulty');

    return recommendations;
}

/**
 * Get trending courses
 */
async function getTrendingCourses() {
    const trending = await Lesson.find({
        status: 'published',
        isActive: true
    })
        .sort({ 'analytics.totalViews': -1 })
        .limit(5)
        .select('lessonName description level subject analytics.totalViews');

    return trending;
}

/**
 * Get all levels overview
 */
async function getAllLevelsOverview(user) {
    const overview = [];

    for (let level = 1; level <= 20; level++) {
        const lessonsCount = await Lesson.countDocuments({ level, status: 'published' });
        const completedCount = await UserProgress.countDocuments({
            userId: user.firebaseId,
            completed: true,
            lessonId: { $in: await Lesson.find({ level }).distinct('_id') }
        });

        overview.push({
            level,
            grade: platformSettings.levelGradeMapping[level],
            totalLessons: lessonsCount,
            completed: completedCount,
            progress: lessonsCount > 0 ? Math.round((completedCount / lessonsCount) * 100) : 0
        });
    }

    return overview;
}

/**
 * Get continue learning suggestions
 */
async function getContinueLearning(user) {
    const inProgress = await UserProgress.find({
        userId: user.firebaseId,
        completed: false,
        progressPercent: { $gt: 0 }
    })
        .populate('lessonId', 'lessonName description level subject')
        .sort({ updatedAt: -1 })
        .limit(5);

    return inProgress.map(p => ({
        lessonId: p.lessonId?._id,
        lessonName: p.lessonId?.lessonName,
        level: p.lessonId?.level,
        progress: p.progressPercent || 0,
        lastAccessed: p.updatedAt
    }));
}

/**
 * Get average score
 */
async function getAverageScore(user) {
    const result = await UserProgress.aggregate([
        { $match: { userId: user.firebaseId, completed: true } },
        { $group: { _id: null, avgScore: { $avg: '$score' } } }
    ]);

    return result[0]?.avgScore || 0;
}

/**
 * Calculate weekly time
 */
function calculateWeeklyTime(explorationHistory) {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const weeklyHistory = explorationHistory.filter(
        h => new Date(h.accessedAt) > oneWeekAgo
    );

    return weeklyHistory.reduce((sum, h) => sum + (h.timeSpent || 0), 0);
}

/**
 * Calculate favorite subjects
 */
function calculateFavoriteSubjects(explorationHistory) {
    // This is a placeholder - would need to populate topic data
    return ['English', 'Math', 'Programming'];
}

/**
 * Determine learning pattern
 */
function determineLearningPattern(explorationHistory) {
    if (explorationHistory.length < 5) return 'Getting Started';

    const avgTime = explorationHistory.reduce((sum, h) => sum + (h.timeSpent || 0), 0) / explorationHistory.length;

    if (avgTime > 1800) return 'Deep Learner'; // More than 30 minutes
    if (avgTime > 900) return 'Steady Learner'; // 15-30 minutes
    return 'Quick Learner'; // Less than 15 minutes
}

module.exports = router;
