const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            dbName: 'acedDB', // Specify database name explicitly
        });
        
        // Check if it can query
        const collections = await mongoose.connection.db.listCollections().toArray();

    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
        process.exit(1);
    }
};

module.exports = connectDB;
