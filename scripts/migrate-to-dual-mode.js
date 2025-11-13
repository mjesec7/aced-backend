// scripts/migrate-to-dual-mode.js - Migration Script for Dual-Mode System

const mongoose = require('mongoose');
const User = require('../models/user');
const UserProgress = require('../models/userProgress');
const Lesson = require('../models/lesson');
const platformSettings = require('../config/platformSettings');

// Connect to MongoDB
async function connectDB() {
    try {
        const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/aced';
        await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
}

/**
 * Calculate current level based on user's progress
 */
async function calculateCurrentLevel(user) {
    try {
        // Get all completed lessons
        const completedLessons = await UserProgress.find({
            userId: user.firebaseId,
            completed: true
        }).populate('lessonId', 'level');

        if (completedLessons.length === 0) {
            return { level: 1, lessonsCompleted: 0 };
        }

        // Find the highest level completed
        const levels = completedLessons
            .map(p => p.lessonId?.level)
            .filter(level => level != null);

        const maxLevel = Math.max(...levels, 1);

        // Count lessons completed per level
        const levelCounts = {};
        levels.forEach(level => {
            levelCounts[level] = (levelCounts[level] || 0) + 1;
        });

        return {
            level: maxLevel,
            lessonsCompleted: completedLessons.length,
            levelCounts
        };

    } catch (error) {
        console.error('Error calculating level for user:', user.email, error);
        return { level: 1, lessonsCompleted: 0 };
    }
}

/**
 * Map level to grade
 */
function mapLevelToGrade(level) {
    return platformSettings.levelGradeMapping[level] || 'A1';
}

/**
 * Migrate a single user to dual-mode system
 */
async function migrateUser(user) {
    try {
        console.log(`\n📝 Migrating user: ${user.email} (${user.firebaseId})`);

        // Check if already migrated
        if (user.learningMode) {
            console.log('   ⏭️  Already migrated, skipping...');
            return { skipped: true };
        }

        // Determine initial mode based on existing data
        const hasActiveSubscription = user.subscriptionPlan !== 'free';
        const currentProgress = await calculateCurrentLevel(user);
        const hasProgress = currentProgress.lessonsCompleted > 0;

        // Set initial mode
        let initialMode = 'study_centre'; // Default for new/free users

        if (hasActiveSubscription && hasProgress) {
            initialMode = 'school'; // Existing paid users with progress
            console.log('   🎓 Setting mode to SCHOOL (active subscription + progress)');
        } else {
            console.log('   🌟 Setting mode to STUDY CENTRE (default)');
        }

        user.learningMode = initialMode;

        // Initialize school profile if in school mode
        if (initialMode === 'school') {
            user.schoolProfile = {
                placementTestTaken: true, // Skip test for existing users
                placementTestDate: new Date(),
                currentLevelCap: currentProgress.level,
                accessibleLevels: Array.from({ length: currentProgress.level }, (_, i) => i + 1),
                currentGrade: mapLevelToGrade(currentProgress.level),
                progressLocked: true,
                currentSemester: 1,
                mandatoryCourses: [],
                completedLevels: [],
                curriculum: 'standard',
                requiredCoursesPerLevel: 5,
                minPassingScore: 70,
                placementTestResults: {
                    overallScore: 75, // Default score for migration
                    levelAssigned: currentProgress.level,
                    percentile: 50,
                    subjects: []
                }
            };

            // Mark levels as completed if user has completed enough lessons in them
            Object.entries(currentProgress.levelCounts || {}).forEach(([level, count]) => {
                if (count >= 3) { // If completed 3+ lessons in a level, mark as completed
                    user.schoolProfile.completedLevels.push({
                        level: parseInt(level),
                        completedDate: new Date(),
                        finalScore: 80, // Default score
                        certificate: null,
                        unlockedNext: [parseInt(level) + 1]
                    });
                }
            });

            console.log(`   📊 School Profile: Level ${currentProgress.level}, Grade ${user.schoolProfile.currentGrade}`);
        }

        // Initialize study centre profile
        user.studyCentreProfile = {
            explorationHistory: [],
            bookmarkedCourses: [],
            personalPaths: [],
            preferences: {
                showAllLevels: initialMode === 'study_centre',
                allowJumping: true,
                explorationMode: true
            }
        };

        // Initialize empty mode history
        user.modeHistory = [];

        // Initialize achievements array if not exists
        if (!user.achievements) {
            user.achievements = [];
        }

        // Add migration achievement
        user.achievements.push({
            id: 'dual-mode-migration',
            name: 'Welcome to Dual Mode!',
            description: 'Successfully migrated to the new dual-mode learning system',
            icon: '🎉',
            type: 'system',
            unlockedAt: new Date(),
            data: {
                previousProgress: currentProgress.lessonsCompleted,
                initialMode,
                migrationDate: new Date()
            }
        });

        // Save the user
        await user.save();

        console.log(`   ✅ Migration complete!`);
        console.log(`      - Mode: ${initialMode}`);
        console.log(`      - Level: ${currentProgress.level}`);
        console.log(`      - Lessons Completed: ${currentProgress.lessonsCompleted}`);

        return {
            success: true,
            mode: initialMode,
            level: currentProgress.level,
            lessonsCompleted: currentProgress.lessonsCompleted
        };

    } catch (error) {
        console.error(`   ❌ Error migrating user ${user.email}:`, error.message);
        return { error: true, message: error.message };
    }
}

/**
 * Main migration function
 */
async function migrateAllUsers() {
    console.log('\n🚀 Starting Dual-Mode Migration...\n');
    console.log('=' .repeat(60));

    const stats = {
        total: 0,
        migrated: 0,
        skipped: 0,
        errors: 0,
        schoolMode: 0,
        studyCentreMode: 0
    };

    try {
        // Get all users
        const users = await User.find({});
        stats.total = users.length;

        console.log(`\n📊 Found ${users.length} users to process\n`);

        // Migrate each user
        for (const user of users) {
            const result = await migrateUser(user);

            if (result.skipped) {
                stats.skipped++;
            } else if (result.error) {
                stats.errors++;
            } else if (result.success) {
                stats.migrated++;
                if (result.mode === 'school') {
                    stats.schoolMode++;
                } else {
                    stats.studyCentreMode++;
                }
            }
        }

        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('\n📈 MIGRATION SUMMARY\n');
        console.log(`   Total Users:           ${stats.total}`);
        console.log(`   ✅ Successfully Migrated: ${stats.migrated}`);
        console.log(`   ⏭️  Skipped (already migrated): ${stats.skipped}`);
        console.log(`   ❌ Errors:              ${stats.errors}`);
        console.log('\n   Mode Distribution:');
        console.log(`   🎓 School Mode:         ${stats.schoolMode}`);
        console.log(`   🌟 Study Centre Mode:   ${stats.studyCentreMode}`);
        console.log('\n' + '='.repeat(60));

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        throw error;
    }
}

/**
 * Rollback migration (if needed)
 */
async function rollbackMigration() {
    console.log('\n⚠️  Starting Migration Rollback...\n');

    try {
        const result = await User.updateMany(
            {},
            {
                $unset: {
                    learningMode: '',
                    schoolProfile: '',
                    studyCentreProfile: '',
                    modeHistory: ''
                }
            }
        );

        console.log(`✅ Rollback complete. Modified ${result.modifiedCount} users.`);

    } catch (error) {
        console.error('❌ Rollback failed:', error);
        throw error;
    }
}

// Run migration
if (require.main === module) {
    const command = process.argv[2];

    connectDB().then(async () => {
        try {
            if (command === 'rollback') {
                await rollbackMigration();
            } else {
                await migrateAllUsers();
            }

            console.log('\n✅ Process completed successfully!');
            process.exit(0);

        } catch (error) {
            console.error('\n❌ Process failed:', error);
            process.exit(1);
        }
    });
}

module.exports = {
    migrateAllUsers,
    rollbackMigration,
    migrateUser
};
