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

    // Question Type: multiple-choice, fill-in-blank, true-false, matching, voice-answer, voice-spelling
    questionType: {
        type: String,
        required: true,
        enum: [
            'multiple-choice',
            'fill-in-blank',
            'true-false',
            'matching',
            'voice-answer',     // User speaks the answer (e.g., "What is the powerhouse of the cell?" -> "Mitochondria")
            'voice-spelling'    // User spells out the word (e.g., "Spell: Biology" -> "B-I-O-L-O-G-Y")
        ],
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
                    // True/false can have custom options or use defaults
                    return !v || v.length === 0 || v.length === 2;
                }
                if (this.questionType === 'matching') {
                    return v && v.length >= 3;
                }
                return true; // For fill-in-blank, options are optional (hints)
            },
            message: 'Invalid number of options for question type'
        }
    },

    // Enhanced True/False exercise fields
    trueFalseData: {
        // The statement to evaluate (alternative to questionText for clearer structure)
        statement: {
            type: String,
            trim: true
        },
        // The correct answer as boolean for cleaner handling
        isTrue: {
            type: Boolean
        },
        // Explanation for why the statement is true
        trueExplanation: {
            type: String,
            trim: true
        },
        // Explanation for why the statement is false
        falseExplanation: {
            type: String,
            trim: true
        },
        // Category/topic hint shown to user
        category: {
            type: String,
            trim: true
        },
        // Difficulty indicator text (e.g., "Easy", "Tricky", "Expert")
        difficultyLabel: {
            type: String,
            enum: ['Easy', 'Medium', 'Tricky', 'Expert'],
            default: 'Medium'
        },
        // Source or reference for the fact
        source: {
            type: String,
            trim: true
        },
        // Related fact or "Did you know?" content
        funFact: {
            type: String,
            trim: true
        },
        // Visual aid URL (image, diagram)
        imageUrl: {
            type: String,
            trim: true
        },
        // Tags for filtering/grouping
        tags: {
            type: [String],
            default: []
        }
    },

    // For multiple-choice and true-false (index of correct option OR boolean)
    // For voice-answer and voice-spelling (string of expected answer)
    correctAnswer: {
        type: mongoose.Schema.Types.Mixed,
        required: function() {
            // Not required for true-false if trueFalseData.isTrue is set
            if (this.questionType === 'true-false' && this.trueFalseData?.isTrue !== undefined) {
                return false;
            }
            return ['multiple-choice', 'true-false', 'voice-answer', 'voice-spelling'].includes(this.questionType);
        },
        validate: {
            validator: function(v) {
                if (this.questionType === 'multiple-choice') {
                    return typeof v === 'number' && v >= 0 && v < this.options.length;
                }
                if (this.questionType === 'true-false') {
                    // Accept: number (0/1 index), boolean, or rely on trueFalseData.isTrue
                    if (this.trueFalseData?.isTrue !== undefined) return true;
                    return typeof v === 'number' || typeof v === 'boolean';
                }
                if (this.questionType === 'fill-in-blank') {
                    return typeof v === 'string' || Array.isArray(v);
                }
                if (this.questionType === 'matching') {
                    return Array.isArray(v);
                }
                if (this.questionType === 'voice-answer' || this.questionType === 'voice-spelling') {
                    // Voice answers must be strings
                    return typeof v === 'string' && v.trim().length > 0;
                }
                return true;
            },
            message: 'Invalid correct answer for question type'
        }
    },

    // For voice-answer: similarity threshold (0-1) for fuzzy matching
    voiceSimilarityThreshold: {
        type: Number,
        default: 0.85,
        min: 0.5,
        max: 1.0
    },

    // For voice-spelling: whether to require exact letter-by-letter spelling
    requireExactSpelling: {
        type: Boolean,
        default: false
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
questionSchema.methods.validateAnswer = function(userAnswer, similarity = null) {
    switch (this.questionType) {
        case 'multiple-choice':
            return userAnswer === this.correctAnswer;

        case 'true-false':
            // Get the correct answer from trueFalseData or correctAnswer
            let correctValue;
            if (this.trueFalseData?.isTrue !== undefined) {
                correctValue = this.trueFalseData.isTrue;
            } else if (typeof this.correctAnswer === 'boolean') {
                correctValue = this.correctAnswer;
            } else if (typeof this.correctAnswer === 'number') {
                // 0 = True, 1 = False (based on options array)
                correctValue = this.correctAnswer === 0;
            } else {
                return false;
            }

            // Normalize user answer to boolean
            let userBool;
            if (typeof userAnswer === 'boolean') {
                userBool = userAnswer;
            } else if (typeof userAnswer === 'number') {
                userBool = userAnswer === 0;
            } else if (typeof userAnswer === 'string') {
                userBool = userAnswer.toLowerCase() === 'true' || userAnswer === '0';
            } else {
                return false;
            }

            return userBool === correctValue;

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

        case 'voice-answer':
            // For voice answers, use similarity score if provided
            if (similarity !== null) {
                return similarity >= (this.voiceSimilarityThreshold || 0.85);
            }
            // Fallback to simple string comparison
            if (!userAnswer || typeof userAnswer !== 'string') return false;
            return userAnswer.trim().toLowerCase() === this.correctAnswer.trim().toLowerCase();

        case 'voice-spelling':
            // For spelling, compare letter by letter (more strict)
            if (!userAnswer || typeof userAnswer !== 'string') return false;
            const userSpelling = userAnswer.replace(/[^a-zA-Z]/g, '').toLowerCase();
            const correctSpelling = this.correctAnswer.replace(/[^a-zA-Z]/g, '').toLowerCase();

            if (this.requireExactSpelling) {
                return userSpelling === correctSpelling;
            }
            // Allow similarity-based matching for spelling too
            if (similarity !== null) {
                return similarity >= (this.voiceSimilarityThreshold || 0.90);
            }
            return userSpelling === correctSpelling;

        default:
            return false;
    }
};

// Method to get explanation for true/false questions
questionSchema.methods.getTrueFalseExplanation = function(userWasCorrect) {
    if (this.questionType !== 'true-false') {
        return this.explanation || null;
    }

    const isTrue = this.trueFalseData?.isTrue ?? (this.correctAnswer === 0 || this.correctAnswer === true);

    // Return appropriate explanation
    if (isTrue) {
        return this.trueFalseData?.trueExplanation || this.explanation || 'This statement is TRUE.';
    } else {
        return this.trueFalseData?.falseExplanation || this.explanation || 'This statement is FALSE.';
    }
};

// Method to get formatted true/false question data for frontend
questionSchema.methods.getTrueFalseDisplay = function() {
    if (this.questionType !== 'true-false') {
        return null;
    }

    return {
        statement: this.trueFalseData?.statement || this.questionText,
        category: this.trueFalseData?.category || this.category,
        difficultyLabel: this.trueFalseData?.difficultyLabel || 'Medium',
        imageUrl: this.trueFalseData?.imageUrl || null,
        tags: this.trueFalseData?.tags || [],
        funFact: this.trueFalseData?.funFact || null,
        source: this.trueFalseData?.source || null,
        options: this.options?.length === 2 ? this.options : ['True', 'False']
    };
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
