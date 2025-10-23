// server.js - REFACTORED MODULAR VERSION
// ========================================
// 🚀 MAIN SERVER ENTRY POINT
// ========================================

const express = require('express');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables first
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ========================================
// 📦 IMPORT CONFIGURATION MODULES
// ========================================
const connectDB = require('./config/database');
const { configureMiddlewares } = require('./config/middlewares');
const { configureCORS } = require('./config/cors');
const { mountRoutes } = require('./config/routes');
const { configureErrorHandlers } = require('./config/errorHandlers');
const { serveStaticFiles } = require('./config/staticFiles');

// ========================================
// 🔧 IMPORT UTILITY MODULES
// ========================================
const { healthCheckHandler, authTestHandler, statusHandler } = require('./utils/systemHandlers');
const { checkExpiredSubscriptions } = require('./utils/subscriptionChecker');

// ========================================
// 🚀 SERVER SETUP
// ========================================

const startServer = async () => {
  try {
    console.log('\n🚀 Starting ACED API Server...\n');

    // 1. Configure middlewares (body parsing, compression, etc.)
    configureMiddlewares(app);

    // 2. Configure CORS
    configureCORS(app);

    // 3. Connect to database
    await connectDB();

    // 4. Mount health check endpoints (before routes)
    app.get('/health', healthCheckHandler);
    app.get('/api/health', healthCheckHandler);
    app.get('/auth-test', authTestHandler);
    app.get('/api/auth-test', authTestHandler);
    app.get('/api/status', statusHandler);

    // 5. Mount all routes
    await mountRoutes(app);

    // 6. Serve static files
    serveStaticFiles(app);

    // 7. Configure error handlers (must be last)
    configureErrorHandlers(app);

    // 8. Start subscription checker (runs hourly)
    setInterval(checkExpiredSubscriptions, 60 * 60 * 1000);
    setTimeout(checkExpiredSubscriptions, 30000);

    // 9. Start the server
    const server = app.listen(PORT, () => {
      console.log('✅ Server started successfully');
      console.log(`🌐 Server: http://localhost:${PORT}`);
      console.log(`📊 Health Check: http://localhost:${PORT}/health`);
      console.log(`🔐 Auth Test: http://localhost:${PORT}/auth-test`);
      console.log(`📖 API Routes: http://localhost:${PORT}/api/routes`);
      console.log(`💳 PayMe Test: http://localhost:${PORT}/api/payments/payme/test`);
      console.log(`\n✨ Environment: ${process.env.NODE_ENV || 'development'}\n`);
    });

    // Graceful shutdown handlers
    const gracefulShutdown = (signal) => {
      console.log(`\n⚠️  ${signal} received, starting graceful shutdown...`);
      server.close(() => {
        console.log('✅ HTTP server closed');
        const mongoose = require('mongoose');
        mongoose.connection.close(() => {
          console.log('✅ MongoDB connection closed');
          process.exit(0);
        });
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// ========================================
// 🛡️ PROCESS ERROR HANDLERS
// ========================================

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️  Unhandled Rejection at:', promise);
  console.error('⚠️  Reason:', reason);
  if (process.env.NODE_ENV === 'production') {
    console.error('🚨 Exiting due to unhandled rejection in production');
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('🚨 Exiting due to uncaught exception');
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;