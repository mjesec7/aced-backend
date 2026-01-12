// scripts/seedQuestions.js - Script to seed question bank

const mongoose = require('mongoose');
const Question = require('../models/question');
const questionsData = require('../seedData/questions');

// Load environment variables
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aced-learning';

async function seedQuestions() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Check if questions already exist
        const existingCount = await Question.countDocuments();

        if (existingCount > 0) {
            console.log(`⚠️  Found ${existingCount} existing questions.`);
            console.log('Do you want to:');
            console.log('1. Keep existing questions and add new ones (if any)');
            console.log('2. Delete all and reseed');
            console.log('');
            console.log('For now, keeping existing questions...');

            // Add only new questions that don't exist
            let addedCount = 0;
            for (const questionData of questionsData) {
                const exists = await Question.findOne({
                    questionText: questionData.questionText
                });

                if (!exists) {
                    await Question.create(questionData);
                    addedCount++;
                }
            }

            console.log(`✅ Added ${addedCount} new questions`);
            console.log(`📊 Total questions in database: ${existingCount + addedCount}`);
        } else {
            // Insert all questions
            console.log(`📝 Seeding ${questionsData.length} questions...`);
            await Question.insertMany(questionsData);
            console.log(`✅ Successfully seeded ${questionsData.length} questions!`);
        }

        // Display statistics
        const stats = await Question.aggregate([
            {
                $group: {
                    _id: {
                        subject: '$subject',
                        difficulty: '$difficulty'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.subject',
                    totalQuestions: { $sum: '$count' },
                    difficulties: {
                        $push: {
                            level: '$_id.difficulty',
                            count: '$count'
                        }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        console.log('\n📊 Question Bank Statistics:');
        console.log('═══════════════════════════════════════');

        for (const subjectStat of stats) {
            console.log(`\n${subjectStat._id}: ${subjectStat.totalQuestions} questions`);

            // Group by difficulty range
            const easy = subjectStat.difficulties.filter(d => d.level <= 3)
                .reduce((sum, d) => sum + d.count, 0);
            const medium = subjectStat.difficulties.filter(d => d.level >= 4 && d.level <= 6)
                .reduce((sum, d) => sum + d.count, 0);
            const hard = subjectStat.difficulties.filter(d => d.level >= 7)
                .reduce((sum, d) => sum + d.count, 0);

            console.log(`  - Easy (1-3):   ${easy} questions`);
            console.log(`  - Medium (4-6): ${medium} questions`);
            console.log(`  - Hard (7-10):  ${hard} questions`);
        }

        const totalQuestions = await Question.countDocuments();
        console.log('\n═══════════════════════════════════════');
        console.log(`📚 Total Questions: ${totalQuestions}`);
        console.log('═══════════════════════════════════════\n');

        console.log('✨ Seeding complete!');

    } catch (error) {
        console.error('❌ Error seeding questions:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
        process.exit(0);
    }
}

// Run the seeding function
seedQuestions();
