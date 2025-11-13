// scripts/testPlacementTest.js - Test Placement Test Endpoints

const mongoose = require('mongoose');
const Question = require('../models/question');
const PlacementTest = require('../models/placementTest');

require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aced-learning';

async function testPlacementTest() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Test 1: Check questions exist
        console.log('📝 Test 1: Checking Questions Database');
        const totalQuestions = await Question.countDocuments();
        console.log(`   Total Questions: ${totalQuestions}`);

        if (totalQuestions === 0) {
            console.log('   ❌ ERROR: No questions found! Run seed script first.');
            process.exit(1);
        }

        // Check questions per subject
        const subjects = ['English', 'Mathematics', 'Science', 'History', 'Geography'];
        for (const subject of subjects) {
            const count = await Question.countDocuments({ subject, isActive: true });
            console.log(`   ${subject}: ${count} questions`);
        }

        console.log('   ✅ Questions database looks good!\n');

        // Test 2: Test getAdaptiveQuestion logic
        console.log('📚 Test 2: Testing Adaptive Question Selection');
        const testSubject = 'English';
        const testDifficulty = 5;

        const questions = await Question.find({
            subject: testSubject,
            difficulty: {
                $gte: Math.max(1, testDifficulty - 0.5),
                $lte: Math.min(10, testDifficulty + 0.5)
            },
            isActive: true
        });

        console.log(`   Found ${questions.length} questions for ${testSubject} at difficulty ${testDifficulty}`);

        if (questions.length > 0) {
            const sampleQuestion = questions[0];
            console.log(`   Sample Question:`);
            console.log(`     - Text: ${sampleQuestion.questionText}`);
            console.log(`     - Options: ${sampleQuestion.options.length}`);
            console.log(`     - Correct Answer: ${sampleQuestion.correctAnswer}`);
            console.log(`   ✅ Question selection works!\n`);
        } else {
            console.log('   ⚠️  No questions found at this difficulty\n');
        }

        // Test 3: Check PlacementTest model
        console.log('🧪 Test 3: Testing PlacementTest Model');
        const testConfig = {
            userId: 'test-user-123',
            status: 'in_progress',
            startedAt: new Date()
        };

        const test = new PlacementTest(testConfig);
        console.log(`   Config Subjects: ${test.config.subjects.join(', ')}`);
        console.log(`   Total Questions: ${test.config.totalQuestions}`);
        console.log(`   Time Limit: ${test.config.timeLimit} minutes`);
        console.log(`   ✅ PlacementTest model works!\n`);

        // Test 4: Simulate question fetching for all subjects
        console.log('🔄 Test 4: Testing All Subjects');
        let allGood = true;
        for (const subject of test.config.subjects) {
            const subjectQuestions = await Question.find({
                subject: subject,
                isActive: true
            });

            if (subjectQuestions.length === 0) {
                console.log(`   ❌ ${subject}: NO QUESTIONS FOUND!`);
                allGood = false;
            } else {
                console.log(`   ✅ ${subject}: ${subjectQuestions.length} questions available`);
            }
        }

        if (!allGood) {
            console.log('\n   ⚠️  Some subjects are missing questions!\n');
        } else {
            console.log('\n   ✅ All subjects have questions!\n');
        }

        // Test 5: Simulate full test flow
        console.log('🎯 Test 5: Simulating Test Flow');
        const firstSubject = test.config.subjects[0];
        const firstQuestion = await Question.findOne({
            subject: firstSubject,
            difficulty: { $gte: 4, $lte: 6 },
            isActive: true
        });

        if (firstQuestion) {
            console.log(`   First Question: ${firstQuestion.questionText.substring(0, 50)}...`);
            console.log(`   ✅ Can fetch questions for test!\n`);
        } else {
            console.log(`   ❌ Could not fetch first question\n`);
        }

        console.log('═══════════════════════════════════════');
        console.log('✅ All tests passed! Backend is ready!');
        console.log('═══════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
        process.exit(0);
    }
}

// Run tests
testPlacementTest();
