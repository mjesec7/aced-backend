// models/question.js - Question Model for Placement Test

const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    subject: {
        type: String,
        required: true,
        enum: ['English', 'Mathematics', 'Science', 'History', 'Geography'],
        index: true
    },

    difficulty: {
        type: Number,
        required: true,
        min: 1,
        max: 10,
        index: true
    },

    level: {
        type: Number,
        required: true,
        min: 1,
        max: 20
    },

    questionText: {
        type: String,
        required: true
    },

    options: [{
        type: String,
        required: true,
        validate: {
            validator: function(v) {
                return this.options.length === 4;
            },
            message: 'Must have exactly 4 options'
        }
    }],

    correctAnswer: {
        type: Number, // Index of correct option (0-3)
        required: true,
        min: 0,
        max: 3
    },

    category: {
        type: String,
        required: false
    },

    tags: [{
        type: String
    }],

    // Analytics
    analytics: {
        timesAsked: {
            type: Number,
            default: 0
        },
        correctAnswers: {
            type: Number,
            default: 0
        },
        averageTimeSpent: {
            type: Number,
            default: 0
        }
    },

    // Metadata
    isActive: {
        type: Boolean,
        default: true
    },

    createdBy: {
        type: String
    }

}, {
    timestamps: true
});

// Indexes for efficient queries
questionSchema.index({ subject: 1, difficulty: 1 });
questionSchema.index({ subject: 1, difficulty: 1, isActive: 1 });
questionSchema.index({ level: 1, subject: 1 });

// --- Methods ---

/**
 * Record that this question was asked in a test
 * @param {boolean} wasCorrect - Whether the answer was correct
 * @param {number} timeSpent - Time spent on the question in seconds
 */
questionSchema.methods.recordUsage = async function(wasCorrect, timeSpent) {
    this.analytics.timesAsked += 1;
    if (wasCorrect) {
        this.analytics.correctAnswers += 1;
    }

    // Update average time spent
    const currentAvg = this.analytics.averageTimeSpent || 0;
    const totalTime = currentAvg * (this.analytics.timesAsked - 1) + timeSpent;
    this.analytics.averageTimeSpent = totalTime / this.analytics.timesAsked;

    await this.save();
};

/**
 * Get the difficulty rating of this question based on historical performance
 * @returns {number} Difficulty score from 1-10
 */
questionSchema.methods.getActualDifficulty = function() {
    if (this.analytics.timesAsked < 10) {
        return this.difficulty; // Not enough data, use assigned difficulty
    }

    const successRate = this.analytics.correctAnswers / this.analytics.timesAsked;

    // Adjust difficulty based on actual performance
    if (successRate > 0.8) {
        return Math.max(1, this.difficulty - 1); // Easier than expected
    } else if (successRate < 0.4) {
        return Math.min(10, this.difficulty + 1); // Harder than expected
    }

    return this.difficulty;
};

// --- Static Methods ---

/**
 * Get a random question matching the criteria
 * @param {string} subject - The subject
 * @param {number} difficulty - The difficulty level (1-10)
 * @param {Array} excludeIds - Question IDs to exclude (already asked)
 * @returns {Promise<Question>} A matching question
 */
questionSchema.statics.getAdaptiveQuestion = async function(subject, difficulty, excludeIds = []) {
    // Find questions within difficulty range
    const difficultyRange = 0.5;

    const query = {
        subject: subject,
        difficulty: {
            $gte: Math.max(1, difficulty - difficultyRange),
            $lte: Math.min(10, difficulty + difficultyRange)
        },
        isActive: true,
        _id: { $nin: excludeIds }
    };

    const questions = await this.find(query);

    if (questions.length === 0) {
        // Fallback to any question for this subject
        const fallback = await this.findOne({
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
    const randomIndex = Math.floor(Math.random() * questions.length);
    return questions[randomIndex];
};

/**
 * Get questions for seeding the database
 * @returns {Array} Array of question objects for seeding
 */
questionSchema.statics.getSeedData = function() {
    return require('../seedData/questions');
};

const Question = mongoose.model('Question', questionSchema);

module.exports = Question;
