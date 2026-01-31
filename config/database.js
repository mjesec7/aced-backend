// config/database.js
// ========================================
// 💾 DATABASE CONNECTION CONFIGURATION
// ========================================
// This merges your existing config/db.js with enhanced error handling

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Check if MongoDB URI exists
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI environment variable is not set');
    }

    // Enable Mongoose debugging in development
    mongoose.set('debug', process.env.NODE_ENV === 'development');

    // Fixed connection options for Mongoose 8.x
    const connectionOptions = {
      dbName: 'acedDB', // ✅ Use your database name
      
      // Timeout settings
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,

      // Pool settings
      maxPoolSize: 10,
      minPoolSize: 2,

      // Retry settings
      retryWrites: true,
      retryReads: true,

      // Buffer settings
      bufferCommands: false,

      // Heartbeat
      heartbeatFrequencyMS: 10000,

      // Auto-reconnect settings
      autoIndex: process.env.NODE_ENV !== 'production',
    };

    // Attempt connection
    await mongoose.connect(process.env.MONGO_URI, connectionOptions);

    // Connection event listeners
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
      if (err.stack && process.env.NODE_ENV === 'development') {
        console.error('Stack:', err.stack);
      }
    });

    mongoose.connection.on('timeout', () => {
      console.error('⏰ MongoDB connection timeout');
    });

    // Test the connection
    await mongoose.connection.db.admin().ping();

  } catch (error) {
    console.error('\n❌ MongoDB Connection Error:', error);
    console.error('Error message:', error.message);

    // Detailed error analysis
    const connectionDetails = {
      hasMongoUri: !!process.env.MONGO_URI,
      uriLength: process.env.MONGO_URI?.length || 0,
      hasProtocol: process.env.MONGO_URI?.startsWith('mongodb'),
      mongooseVersion: mongoose.version,
      nodeVersion: process.version,
      errorName: error.name,
      errorCode: error.code
    };

    console.error('🔍 Connection analysis:', connectionDetails);

    // Common error solutions
    if (error.message.includes('ENOTFOUND')) {
      console.error('💡 Solution: Check your MongoDB host/URL');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('💡 Solution: Ensure MongoDB server is running');
    } else if (error.message.includes('authentication failed')) {
      console.error('💡 Solution: Check your MongoDB credentials');
    } else if (error.message.includes('timeout')) {
      console.error('💡 Solution: Check network connectivity or increase timeout');
    } else if (error.message.includes('not supported')) {
      console.error('💡 Solution: Mongoose version incompatibility - check connection options');
    }

    if (process.env.NODE_ENV === 'production') {
      console.error('🚨 Exiting in production due to DB failure');
      process.exit(1);
    } else {
      console.warn('⚠️ Server running without database connection in development mode');
    }
  }
};

module.exports = connectDB;