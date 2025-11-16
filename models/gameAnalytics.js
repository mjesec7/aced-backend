// models/gameAnalytics.js - Game Performance Analytics

const mongoose = require('mongoose');

const gameAnalyticsSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },

    lessonId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lesson',
        required: true,
        index: true
    },

    stepIndex: {
        type: Number,
        required: true
    },

    gameType: {
        type: String,
        required: true,
        enum: [
            'basket-catch',
            'memory-cards',
            'whack-a-mole',
            'tower-builder',
            'target-practice',
            'maze-runner',
            'bubble-pop',
            'lightning-round',
            'scale-balance',
            'pattern-builder'
        ],
        index: true
    },

    performance: {
        score: {
            type: Number,
            default: 0,
            min: 0
        },
        stars: {
            type: Number,
            default: 0,
            min: 0,
            max: 3
        },
        accuracy: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        timeSpent: {
            type: Number, // in seconds
            default: 0
        },
        itemsCollected: {
            type: Number,
            default: 0
        },
        correctItems: {
            type: Number,
            default: 0
        },
        wrongItems: {
            type: Number,
            default: 0
        },
        attempts: {
            type: Number,
            default: 1
        },
        livesUsed: {
            type: Number,
            default: 0
        }
    },

    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: 'medium'
    },

    completed: {
        type: Boolean,
        default: false
    },

    // Detailed play-by-play data
    actions: [{
        timestamp: Date,
        action: String,
        itemId: String,
        correct: Boolean,
        points: Number
    }],

    // Rewards earned
    rewards: {
        points: {
            type: Number,
            default: 0
        },
        stars: {
            type: Number,
            default: 0
        },
        badges: [String],
        unlocks: [String]
    },

    metadata: {
        deviceType: String,
        browserType: String,
        screenSize: String,
        platform: String
    }

}, {
    timestamps: true
});

// Indexes for efficient queries
gameAnalyticsSchema.index({ userId: 1, lessonId: 1 });
gameAnalyticsSchema.index({ userId: 1, gameType: 1 });
gameAnalyticsSchema.index({ gameType: 1, 'performance.score': -1 }); // Leaderboard
gameAnalyticsSchema.index({ createdAt: -1 });

// Static method to get user's best score for a game
gameAnalyticsSchema.statics.getBestScore = async function(userId, gameType, lessonId) {
    return await this.findOne({ userId, gameType, lessonId })
        .sort({ 'performance.score': -1 })
        .limit(1);
};

// Static method to get leaderboard
gameAnalyticsSchema.statics.getLeaderboard = async function(gameType, limit = 10) {
    return await this.aggregate([
        { $match: { gameType, completed: true } },
        { $sort: { 'performance.score': -1, createdAt: 1 } },
        { $limit: limit },
        {
            $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: 'firebaseId',
                as: 'user'
            }
        },
        {
            $project: {
                userId: 1,
                'performance.score': 1,
                'performance.stars': 1,
                'performance.accuracy': 1,
                'performance.timeSpent': 1,
                userName: { $arrayElemAt: ['$user.name', 0] },
                createdAt: 1
            }
        }
    ]);
};

// Static method to get user statistics
gameAnalyticsSchema.statics.getUserStats = async function(userId) {
    return await this.aggregate([
        { $match: { userId } },
        {
            $group: {
                _id: '$gameType',
                totalGames: { $sum: 1 },
                totalScore: { $sum: '$performance.score' },
                avgScore: { $avg: '$performance.score' },
                totalStars: { $sum: '$performance.stars' },
                avgAccuracy: { $avg: '$performance.accuracy' },
                totalTimeSpent: { $sum: '$performance.timeSpent' },
                gamesCompleted: {
                    $sum: { $cond: ['$completed', 1, 0] }
                },
                bestScore: { $max: '$performance.score' }
            }
        }
    ]);
};

const GameAnalytics = mongoose.model('GameAnalytics', gameAnalyticsSchema);
module.exports = GameAnalytics;
