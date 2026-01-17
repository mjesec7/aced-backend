// Seed script for Brilliant-style interactives demo lessons
const mongoose = require('mongoose');
const Lesson = require('../models/lesson');
require('dotenv').config({ path: '../.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aced';

// Helper to create proper ObjectIds
const createObjectId = () => new mongoose.Types.ObjectId();

const brilliantDemoLessons = [
    {
        subject: "Mathematics",
        level: 5,
        topic: "Data Analysis",
        topicId: createObjectId(),
        lessonName: "Data Analysis with Histograms",
        description: "Learn to analyze data distributions using interactive histograms",
        type: "free",
        difficulty: "intermediate",
        isActive: true,
        status: "published",
        visibility: "public",
        timing: {
            estimatedDuration: 15
        },
        stepRequirements: {
            explanation: { required: true, minCount: 1 },
            exercise: { required: true, minCount: 1 }
        },
        steps: [
            {
                type: "explanation",
                order: 0,
                title: "Understanding Histograms",
                instructions: "Learn what histograms are and how to interpret them",
                difficulty: "intermediate",
                estimatedDuration: 3,
                content: {
                    text: "A histogram is a graphical representation of data distribution. It shows how frequently different values occur in a dataset. The height of each bar represents the frequency of values in that range."
                },
                scoring: {
                    maxPoints: 0,
                    passingScore: 0,
                    weight: 0
                }
            },
            {
                type: "exercise",
                order: 1,
                title: "Find the Median Value",
                instructions: "Use the interactive histogram to determine the median age value",
                difficulty: "intermediate",
                estimatedDuration: 12,
                content: {
                    type: "histogram",
                    data: {
                        title: "Population Age Distribution",
                        description: "Drag the slider to select the median value from this age histogram",
                        data: {
                            labels: ["20", "30", "40", "50", "60", "70", "80", "90", "100"],
                            values: [45, 75, 95, 110, 100, 85, 60, 35, 15]
                        },
                        correctValue: 4129,
                        min: 100,
                        max: 5000,
                        step: 1,
                        minLabel: "Age",
                        maxLabel: "5000"
                    }
                },
                scoring: {
                    maxPoints: 100,
                    passingScore: 70,
                    weight: 1,
                    allowRetry: true,
                    maxRetries: 3
                }
            }
        ],
        gamification: {
            enabled: true,
            points: 100,
            badges: [
                {
                    id: "data-analyst",
                    name: "Data Analyst",
                    icon: "📊",
                    condition: "Complete histogram exercise correctly"
                }
            ]
        },
        assessment: {
            enabled: true,
            passingScore: 70,
            certificateEligible: false
        },
        modeRestrictions: {
            schoolOnly: false,
            studyCentreOnly: false,
            availableInBothModes: true
        },
        metadata: {
            version: 1,
            language: "en",
            targetAudience: ["intermediate", "advanced"],
            keywords: ["histogram", "data", "statistics", "math", "interactive"]
        }
    },
    {
        subject: "Geography",
        level: 3,
        topic: "World Geography",
        topicId: createObjectId(),
        lessonName: "World Geography - Map Classification",
        description: "Test your geography knowledge with interactive map exercises",
        type: "free",
        difficulty: "beginner",
        isActive: true,
        status: "published",
        visibility: "public",
        timing: {
            estimatedDuration: 10
        },
        stepRequirements: {
            explanation: { required: true, minCount: 1 },
            exercise: { required: true, minCount: 1 }
        },
        steps: [
            {
                type: "explanation",
                order: 0,
                title: "Geography of Europe",
                instructions: "Learn about major cities in Europe",
                difficulty: "beginner",
                estimatedDuration: 2,
                content: {
                    text: "Europe is home to many important cities. Bergen is a city on the west coast of Norway, known for its beautiful fjords and rich maritime history. It is often called the 'Gateway to the Fjords of Norway'."
                },
                scoring: {
                    maxPoints: 0,
                    passingScore: 0,
                    weight: 0
                }
            },
            {
                type: "exercise",
                order: 1,
                title: "Locate Bergen",
                instructions: "Find and click on Bergen, Norway on the interactive map",
                difficulty: "beginner",
                estimatedDuration: 8,
                content: {
                    type: "map",
                    data: {
                        title: "Find Bergen, Norway",
                        description: "Click on the correct marker to identify the location of Bergen",
                        image: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCBmaWxsPSIjYzZlMmZmIiB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIvPjxwYXRoIGQ9Ik0yMDAsMTUwIEw1MDAsMTUwIEw1MDAsMzUwIEwyMDAsMzUwIFoiIGZpbGw9IiNlZmY0ZTQiIHN0cm9rZT0iIzcwYTBjNSIgc3Ryb2tlLXdpZHRoPSIyIi8+PHRleHQgeD0iNDAwIiB5PSIzMDAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIzMCIgZmlsbD0iIzMzMyIgdGV4dC1hbmNob3I9Im1pZGRsZSI+RXVyb3BlPC90ZXh0Pjwvc3ZnPg==",
                        markers: [
                            { id: 1, x: 60.4, y: 18.2, label: "Bergen", isCorrect: true },
                            { id: 2, x: 45.3, y: 35.6, label: "Paris", isCorrect: false },
                            { id: 3, x: 70.2, y: 25.4, label: "Moscow", isCorrect: false },
                            { id: 4, x: 52.8, y: 42.1, label: "Rome", isCorrect: false }
                        ]
                    }
                },
                scoring: {
                    maxPoints: 100,
                    passingScore: 100,
                    weight: 1,
                    allowRetry: true,
                    maxRetries: 5
                }
            }
        ],
        gamification: {
            enabled: true,
            points: 100,
            badges: [
                {
                    id: "geography-expert",
                    name: "Geography Expert",
                    icon: "🗺️",
                    condition: "Correctly locate Bergen on the map"
                }
            ]
        },
        assessment: {
            enabled: true,
            passingScore: 100,
            certificateEligible: false
        },
        modeRestrictions: {
            schoolOnly: false,
            studyCentreOnly: false,
            availableInBothModes: true
        },
        metadata: {
            version: 1,
            language: "en",
            targetAudience: ["beginner", "elementary"],
            keywords: ["geography", "map", "europe", "cities", "interactive"]
        }
    },
    {
        subject: "Computer Science",
        level: 1,
        topic: "Programming Basics",
        topicId: createObjectId(),
        lessonName: "Block Coding: Maze Challenge",
        description: "Learn programming basics by controlling a robot through a maze",
        type: "free",
        difficulty: "beginner",
        isActive: true,
        status: "published",
        visibility: "public",
        timing: {
            estimatedDuration: 20
        },
        stepRequirements: {
            explanation: { required: true, minCount: 1 },
            exercise: { required: true, minCount: 1 }
        },
        steps: [
            {
                type: "explanation",
                order: 0,
                title: "Block-Based Programming",
                instructions: "Learn how to program using visual blocks",
                difficulty: "beginner",
                estimatedDuration: 3,
                content: {
                    text: "Block-based programming allows you to create programs by dragging and connecting visual blocks. Each block represents a command or instruction. You can combine blocks to create complex programs without typing code."
                },
                scoring: {
                    maxPoints: 0,
                    passingScore: 0,
                    weight: 0
                }
            },
            {
                type: "exercise",
                order: 1,
                title: "Navigate the Maze",
                instructions: "Program the robot to reach the goal by adding code blocks",
                difficulty: "beginner",
                estimatedDuration: 17,
                content: {
                    type: "block-coding",
                    data: {
                        type: "maze",
                        title: "Maze Navigation Challenge",
                        description: "Add blocks to move the robot to the star",
                        availableBlocks: ["move_forward", "turn_left", "turn_right"],
                        config: {
                            start: { x: 0, y: 0 },
                            goal: { x: 4, y: 4 },
                            walls: [
                                { x: 1, y: 0 },
                                { x: 1, y: 1 },
                                { x: 3, y: 1 },
                                { x: 3, y: 2 },
                                { x: 1, y: 3 }
                            ]
                        }
                    }
                },
                scoring: {
                    maxPoints: 100,
                    passingScore: 100,
                    weight: 1,
                    allowRetry: true,
                    maxRetries: 999
                }
            }
        ],
        gamification: {
            enabled: true,
            points: 100,
            badges: [
                {
                    id: "code-master",
                    name: "Code Master",
                    icon: "💻",
                    condition: "Complete maze navigation challenge"
                }
            ]
        },
        assessment: {
            enabled: true,
            passingScore: 100,
            certificateEligible: false
        },
        modeRestrictions: {
            schoolOnly: false,
            studyCentreOnly: false,
            availableInBothModes: true
        },
        metadata: {
            version: 1,
            language: "en",
            targetAudience: ["beginner", "elementary"],
            keywords: ["programming", "coding", "maze", "blocks", "logic"]
        }
    },
    {
        subject: "Art",
        level: 2,
        topic: "Geometric Art",
        topicId: createObjectId(),
        lessonName: "Block Coding: Geometric Art",
        description: "Create beautiful geometric patterns using programming blocks",
        type: "free",
        difficulty: "elementary",
        isActive: true,
        status: "published",
        visibility: "public",
        timing: {
            estimatedDuration: 15
        },
        stepRequirements: {
            explanation: { required: true, minCount: 1 },
            exercise: { required: true, minCount: 1 }
        },
        steps: [
            {
                type: "explanation",
                order: 0,
                title: "Turtle Graphics",
                instructions: "Learn how to draw using turtle graphics",
                difficulty: "elementary",
                estimatedDuration: 2,
                content: {
                    text: "Turtle graphics is a popular way to introduce programming to beginners. You control a 'turtle' that can move forward, turn, and draw lines as it moves. By combining these simple commands, you can create complex patterns and shapes."
                },
                scoring: {
                    maxPoints: 0,
                    passingScore: 0,
                    weight: 0
                }
            },
            {
                type: "exercise",
                order: 1,
                title: "Draw Geometric Patterns",
                instructions: "Use code blocks to create a geometric pattern",
                difficulty: "elementary",
                estimatedDuration: 13,
                content: {
                    type: "block-coding",
                    data: {
                        type: "geometry",
                        title: "Create Geometric Art",
                        description: "Combine blocks to draw shapes and patterns",
                        availableBlocks: ["move_forward", "turn_left", "turn_right", "repeat", "draw_line"],
                        config: {
                            targetShape: "square"
                        }
                    }
                },
                scoring: {
                    maxPoints: 100,
                    passingScore: 70,
                    weight: 1,
                    allowRetry: true,
                    maxRetries: 999
                }
            }
        ],
        gamification: {
            enabled: true,
            points: 100,
            badges: [
                {
                    id: "artist-coder",
                    name: "Artist Coder",
                    icon: "🎨",
                    condition: "Create geometric art using code"
                }
            ]
        },
        assessment: {
            enabled: true,
            passingScore: 70,
            certificateEligible: false
        },
        modeRestrictions: {
            schoolOnly: false,
            studyCentreOnly: false,
            availableInBothModes: true
        },
        metadata: {
            version: 1,
            language: "en",
            targetAudience: ["elementary", "intermediate"],
            keywords: ["art", "geometry", "turtle", "graphics", "programming"]
        }
    }
];

async function seedBrilliantLessons() {
    try {
        console.log('🌱 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected successfully!');

        const dummyUserId = createObjectId();

        // Add createdBy field to all lessons
        const lessonsWithCreator = brilliantDemoLessons.map(lesson => ({
            ...lesson,
            createdBy: dummyUserId,
            updatedBy: dummyUserId
        }));

        console.log('\n📚 Inserting Brilliant-style demo lessons...');

        // Delete existing demo lessons
        const deleteResult = await Lesson.deleteMany({
            lessonName: { $regex: /histogram|map classification|block coding/i }
        });
        console.log(`🗑️  Removed ${deleteResult.deletedCount} existing demo lessons`);

        // Insert new lessons
        const insertedLessons = await Lesson.insertMany(lessonsWithCreator);
        console.log(`✅ Inserted ${insertedLessons.length} demo lessons successfully!`);

        console.log('\n📋 Summary of created lessons:');
        insertedLessons.forEach((lesson, index) => {
            const interactiveType = lesson.steps.find(s => s.type === 'exercise')?.content?.type || 'N/A';
            console.log(`${index + 1}. ${lesson.lessonName}`);
            console.log(`   - ID: ${lesson._id}`);
            console.log(`   - Subject: ${lesson.subject}`);
            console.log(`   - Interactive Type: ${interactiveType}`);
            console.log(`   - Level: ${lesson.level}`);
            console.log('');
        });

        console.log('\n🎉 Seeding completed successfully!');
        console.log('\n💡 You can now access these lessons in your ACED frontend application.');
        console.log('📍 The interactives will work on all devices (desktop, tablet, mobile).\n');

    } catch (error) {
        console.error('❌ Error seeding lessons:', error);
        if (error.errors) {
            console.error('\nValidation errors:');
            Object.keys(error.errors).forEach(key => {
                console.error(`  - ${key}: ${error.errors[key].message}`);
            });
        }
    } finally {
        await mongoose.connection.close();
        console.log('\n👋 Database connection closed.');
    }
}

seedBrilliantLessons();
