const mongoose = require('mongoose');

try {
    console.log('Loading Topic model...');
    const Topic = require('./models/topic');
    console.log('Topic model loaded successfully.');

    console.log('Loading Lesson model...');
    const Lesson = require('./models/lesson');
    console.log('Lesson model loaded successfully.');

    console.log('All models loaded.');
} catch (error) {
    console.error('❌ Error loading models:', error);
    process.exit(1);
}
