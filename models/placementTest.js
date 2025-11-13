// models/placementTest.js - Placement Test Model for School Mode

const mongoose = require('mongoose');
const { PLACEMENT_TEST_CONFIG } = require('../constants/learningModes');

const placementTestSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },

    testDate: {
        type: Date,
        default: Date.now
    },

    // Test Configuration
    config: {
        totalQuestions: {
            type: Number,
            default: PLACEMENT_TEST_CONFIG.TOTAL_QUESTIONS
        },
        timeLimit: {
            type: Number,
            default: PLACEMENT_TEST_CONFIG.TIME_LIMIT
        },
        adaptiveMode: {
            type: Boolean,
            default: true
        },
        subjects: {
            type: [String],
            default: PLACEMENT_TEST_CONFIG.SUBJECTS
        }
    },

    // Adaptive Question Flow
    questions: [{
        questionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Question'
        },
        subject: String,
        difficulty: {
            type: Number,
            min: 1,
            max: 10
        },
        questionText: String,
        options: [String],
        correctAnswer: String,

        // User Response
        userAnswer: String,
        isCorrect: Boolean,
        timeSpent: Number, // seconds

        // Adaptive Data
        difficultyAdjustment: Number,
        confidenceScore: Number
    }],

    // Results
    results: {
        overallScore: Number,
        percentile: Number,

        // Level Assignment
        recommendedLevel: Number,
        confidenceScore: Number,

        // Subject-wise breakdown
        subjectScores: [{
            subject: String,
            score: Number,
            level: Number,
            questionsAnswered: Number,
            correctAnswers: Number,
            strengths: [String],
            weaknesses: [String]
        }],

        // Learning Profile
        learningProfile: {
            speed: {
                type: String,
                enum: ['fast', 'moderate', 'slow']
            },
            accuracy: {
                type: String,
                enum: ['high', 'medium', 'low']
            },
            consistency: String,
            recommendedPace: String
        }
    },

    // ML/AI Analysis
    aiAnalysis: {
        processingStyle: String,
        strongSubjects: [String],
        challengingAreas: [String],
        suggestedStartPath: String,
        customRecommendations: [String]
    },

    // Test Status
    status: {
        type: String,
        enum: ['not_started', 'in_progress', 'completed', 'abandoned'],
        default: 'not_started'
    },

    startedAt: Date,
    completedAt: Date

}, {
    timestamps: true
});

// Indexes
placementTestSchema.index({ userId: 1, testDate: -1 });
placementTestSchema.index({ status: 1 });

// --- Methods ---

/**
 * Gets the next question difficulty based on the last answer.
 * Implements adaptive difficulty algorithm.
 * @param {boolean} lastAnswerCorrect - Whether the last answer was correct
 * @returns {number} The next question difficulty (1-10)
 */
placementTestSchema.methods.getNextQuestion = function(lastAnswerCorrect) {
    const lastQuestion = this.questions[this.questions.length - 1];
    let nextDifficulty = lastQuestion ? lastQuestion.difficulty : PLACEMENT_TEST_CONFIG.STARTING_DIFFICULTY;

    if (lastAnswerCorrect) {
        nextDifficulty = Math.min(10, nextDifficulty + 0.5);
    } else {
        nextDifficulty = Math.max(1, nextDifficulty - 0.5);
    }

    return nextDifficulty;
};

/**
 * Calculates the recommended level based on test performance.
 * Uses a weighted algorithm considering difficulty, accuracy, and speed.
 * @returns {Object} Object containing level and confidence score
 */
placementTestSchema.methods.calculateLevel = function() {
    if (this.questions.length === 0) {
        return { level: 1, confidence: 'low' };
    }

    // Calculate average difficulty of correct answers
    const correctAnswers = this.questions.filter(q => q.isCorrect);
    const avgDifficulty = correctAnswers.reduce((sum, q) => sum + q.difficulty, 0) / correctAnswers.length || 1;

    // Calculate accuracy
    const accuracy = correctAnswers.length / this.questions.length;

    // Calculate speed factor (bonus for fast, accurate answers)
    const avgTime = this.questions.reduce((sum, q) => sum + (q.timeSpent || 30), 0) / this.questions.length;
    const speedFactor = avgTime < 20 ? 1.2 : avgTime < 40 ? 1.0 : 0.8;

    // Complex algorithm considering multiple factors
    let level = Math.round(avgDifficulty * accuracy * 2 * speedFactor);
    level = Math.max(1, Math.min(20, level)); // Clamp between 1-20

    // Determine confidence
    let confidence = 'medium';
    if (accuracy > 0.8 && correctAnswers.length >= 10) {
        confidence = 'high';
    } else if (accuracy < 0.5 || correctAnswers.length < 5) {
        confidence = 'low';
    }

    return { level, confidence };
};

/**
 * Analyzes test results and generates comprehensive results object.
 * @returns {Object} Complete test results with analysis
 */
placementTestSchema.methods.analyzeResults = function() {
    const { level, confidence } = this.calculateLevel();

    // Subject-wise analysis
    const subjectScores = this.config.subjects.map(subject => {
        const subjectQuestions = this.questions.filter(q => q.subject === subject);
        const correctCount = subjectQuestions.filter(q => q.isCorrect).length;
        const accuracy = correctCount / subjectQuestions.length || 0;

        return {
            subject,
            score: Math.round(accuracy * 100),
            level: Math.round(level * accuracy),
            questionsAnswered: subjectQuestions.length,
            correctAnswers: correctCount,
            strengths: accuracy > 0.7 ? [`Strong in ${subject}`] : [],
            weaknesses: accuracy < 0.5 ? [`Needs improvement in ${subject}`] : []
        };
    });

    // Calculate overall score
    const overallScore = Math.round(
        (this.questions.filter(q => q.isCorrect).length / this.questions.length) * 100
    );

    // Determine learning profile
    const avgTime = this.questions.reduce((sum, q) => sum + (q.timeSpent || 30), 0) / this.questions.length;
    const accuracy = this.questions.filter(q => q.isCorrect).length / this.questions.length;

    const learningProfile = {
        speed: avgTime < 20 ? 'fast' : avgTime < 40 ? 'moderate' : 'slow',
        accuracy: accuracy > 0.8 ? 'high' : accuracy > 0.6 ? 'medium' : 'low',
        consistency: this.calculateConsistency(),
        recommendedPace: avgTime < 30 && accuracy > 0.7 ? 'accelerated' : 'standard'
    };

    // AI Analysis
    const aiAnalysis = this.generateAIAnalysis(subjectScores, learningProfile);

    return {
        overallScore,
        percentile: this.calculatePercentile(overallScore),
        recommendedLevel: level,
        confidenceScore: confidence,
        subjectScores,
        learningProfile,
        aiAnalysis
    };
};

/**
 * Calculates consistency score based on performance variance.
 * @returns {string} Consistency rating
 */
placementTestSchema.methods.calculateConsistency = function() {
    if (this.questions.length < 5) return 'unknown';

    const scores = this.questions.map(q => q.isCorrect ? 1 : 0);
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;

    if (variance < 0.1) return 'very consistent';
    if (variance < 0.2) return 'consistent';
    if (variance < 0.3) return 'variable';
    return 'inconsistent';
};

/**
 * Calculates percentile based on score.
 * @param {number} score - The test score
 * @returns {number} Percentile ranking
 */
placementTestSchema.methods.calculatePercentile = function(score) {
    // Simple percentile calculation (can be enhanced with historical data)
    if (score >= 90) return 95;
    if (score >= 80) return 80;
    if (score >= 70) return 65;
    if (score >= 60) return 50;
    if (score >= 50) return 35;
    return 20;
};

/**
 * Generates AI-powered analysis and recommendations.
 * @param {Array} subjectScores - Subject-wise scores
 * @param {Object} learningProfile - Learning profile data
 * @returns {Object} AI analysis object
 */
placementTestSchema.methods.generateAIAnalysis = function(subjectScores, learningProfile) {
    const strongSubjects = subjectScores.filter(s => s.score >= 70).map(s => s.subject);
    const challengingAreas = subjectScores.filter(s => s.score < 60).map(s => s.subject);

    const recommendations = [];

    if (learningProfile.speed === 'fast' && learningProfile.accuracy === 'high') {
        recommendations.push('Consider the accelerated curriculum');
        recommendations.push('You can handle challenging material');
    }

    if (challengingAreas.length > 0) {
        recommendations.push(`Focus on strengthening: ${challengingAreas.join(', ')}`);
    }

    if (strongSubjects.length > 0) {
        recommendations.push(`Leverage your strengths in: ${strongSubjects.join(', ')}`);
    }

    return {
        processingStyle: learningProfile.speed === 'fast' ? 'Quick learner' : 'Methodical learner',
        strongSubjects,
        challengingAreas,
        suggestedStartPath: strongSubjects.length >= challengingAreas.length ? 'advanced' : 'foundation',
        customRecommendations: recommendations
    };
};

// --- Static Methods ---

/**
 * Finds or creates a placement test for a user.
 * @param {string} userId - The user ID
 * @returns {Promise<PlacementTest>} The placement test document
 */
placementTestSchema.statics.findOrCreateForUser = async function(userId) {
    let test = await this.findOne({ userId, status: 'in_progress' });

    if (!test) {
        test = await this.create({
            userId,
            status: 'not_started',
            config: {
                totalQuestions: PLACEMENT_TEST_CONFIG.TOTAL_QUESTIONS,
                timeLimit: PLACEMENT_TEST_CONFIG.TIME_LIMIT,
                adaptiveMode: true,
                subjects: PLACEMENT_TEST_CONFIG.SUBJECTS
            }
        });
    }

    return test;
};

const PlacementTest = mongoose.model('PlacementTest', placementTestSchema);

module.exports = PlacementTest;
