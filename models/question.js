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

    // Question Type: multiple-choice, fill-in-blank, true-false, matching
    questionType: {
        type: String,
        required: true,
        enum: ['multiple-choice', 'fill-in-blank', 'true-false', 'matching'],
        default: 'multiple-choice',
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

    // For multiple-choice and true-false
    options: {
        type: [String],
        validate: {
            validator: function(v) {
                if (this.questionType === 'multiple-choice') {
                    return v && v.length >= 2 && v.length <= 6;
                }
                if (this.questionType === 'true-false') {
                    return v && v.length === 2;
                }
                if (this.questionType === 'matching') {
                    return v && v.length >= 3;
                }
                return true; // For fill-in-blank, options are optional (hints)
            },
            message: 'Invalid number of options for question type'
        }
    },

    // For multiple-choice and true-false (index of correct option)
    correctAnswer: {
        type: mongoose.Schema.Types.Mixed,
        required: function() {
            return ['multiple-choice', 'true-false'].includes(this.questionType);
        },
        validate: {
            validator: function(v) {
                if (this.questionType === 'multiple-choice' || this.questionType === 'true-false') {
                    return typeof v === 'number' && v >= 0 && v < this.options.length;
                }
                if (this.questionType === 'fill-in-blank') {
                    return typeof v === 'string' || Array.isArray(v);
                }
                if (this.questionType === 'matching') {
                    return Array.isArray(v);
                }
                return true;
            },
            message: 'Invalid correct answer for question type'
        }
    },

    // For fill-in-blank: accepted answers (case-insensitive matching)
    acceptedAnswers: {
        type: [String],
        validate: {
            validator: function(v) {
                if (this.questionType === 'fill-in-blank') {
                    return v && v.length > 0;
                }
                return true;
            },
            message: 'Fill-in-blank questions must have at least one accepted answer'
        }
    },

    // For matching questions: pairs of items to match
    matchingPairs: {
        type: [{
            left: String,
            right: String
        }],
        validate: {
            validator: function(v) {
                if (this.questionType === 'matching') {
                    return v && v.length >= 3;
                }
                return true;
            },
            message: 'Matching questions must have at least 3 pairs'
        }
    },

    // Hints for fill-in-blank or difficult questions
    hints: {
        type: [String],
        default: []
    },

    // Explanation shown after answering
    explanation: {
        type: String,
        trim: true
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
questionSchema.index({ subject: 1, questionType: 1, isActive: 1 });

// Method to validate answer based on question type
questionSchema.methods.validateAnswer = function(userAnswer) {
    switch (this.questionType) {
        case 'multiple-choice':
        case 'true-false':
            return userAnswer === this.correctAnswer;

        case 'fill-in-blank':
            if (!userAnswer || typeof userAnswer !== 'string') return false;
            const normalizedAnswer = userAnswer.trim().toLowerCase();
            return this.acceptedAnswers.some(accepted =>
                accepted.toLowerCase() === normalizedAnswer
            );

        case 'matching':
            if (!Array.isArray(userAnswer)) return false;
            if (userAnswer.length !== this.matchingPairs.length) return false;
            // userAnswer should be array of indices matching the order
            return userAnswer.every((rightIndex, leftIndex) =>
                this.matchingPairs[leftIndex].right === this.matchingPairs[rightIndex].right
            );

        default:
            return false;
    }
};

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
