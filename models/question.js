// models/question.js - Question Model for School Subject Placement Tests

const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    subject: {
        type: String,
        required: true,
        enum: [
            'English',
            'Mathematics',
            'Science',
            'History',
            'Geography',
            'Computer Science',
            'Literature',
            'Physics',
            'Chemistry',
            'Biology'
        ],
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
        max: 20,
        index: true
    },

    questionText: {
        type: String,
        required: true,
        trim: true
    },

    options: {
        type: [String],
        required: true,
        validate: {
            validator: function(v) {
                return v.length === 4;
            },
            message: 'Question must have exactly 4 options'
        }
    },

    correctAnswer: {
        type: Number,
        required: true,
        min: 0,
        max: 3,
        validate: {
            validator: function(v) {
                return v >= 0 && v <= 3;
            },
            message: 'Correct answer must be index 0-3'
        }
    },

    category: {
        type: String,
        required: true,
        index: true
    },

    // Usage statistics
    usageCount: {
        type: Number,
        default: 0
    },

    correctAttempts: {
        type: Number,
        default: 0
    },

    totalAttempts: {
        type: Number,
        default: 0
    },

    averageTimeSpent: {
        type: Number,
        default: 30
    },

    isActive: {
        type: Boolean,
        default: true,
        index: true
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
questionSchema.index({ subject: 1, difficulty: 1, isActive: 1 });
questionSchema.index({ subject: 1, level: 1, isActive: 1 });

// Method to record usage
questionSchema.methods.recordUsage = async function(isCorrect, timeSpent = 30) {
    this.usageCount++;
    this.totalAttempts++;

    if (isCorrect) {
        this.correctAttempts++;
    }

    // Update average time
    const currentTotal = this.averageTimeSpent * (this.totalAttempts - 1);
    this.averageTimeSpent = Math.round((currentTotal + timeSpent) / this.totalAttempts);

    await this.save();
};

// Static method to get adaptive question
questionSchema.statics.getAdaptiveQuestion = async function(subject, targetDifficulty, excludeIds = []) {
    const minDiff = Math.max(1, targetDifficulty - 0.5);
    const maxDiff = Math.min(10, targetDifficulty + 0.5);

    const questions = await this.find({
        subject,
        difficulty: { $gte: minDiff, $lte: maxDiff },
        isActive: true,
        _id: { $nin: excludeIds }
    });

    if (questions.length === 0) {
        return await this.findOne({
            subject,
            isActive: true,
            _id: { $nin: excludeIds }
        });
    }

    return questions[Math.floor(Math.random() * questions.length)];
};

const Question = mongoose.model('Question', questionSchema);
module.exports = Question;
