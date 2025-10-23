// utils/systemHandlers.js
// ========================================
// 🏥 SYSTEM HANDLER UTILITIES
// ========================================

const mongoose = require('mongoose');
const { getAllowedOrigins } = require('../config/cors');

const healthCheckHandler = async (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    server: 'api.aced.live',
    frontend: 'aced.live',
    versions: {
      node: process.version,
      mongoose: mongoose.version
    },
    memory: process.memoryUsage(),
    database: {
      status: 'disconnected',
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      name: mongoose.connection.name
    },
    payme: {
      configured: !!(process.env.PAYME_MERCHANT_ID && process.env.PAYME_MERCHANT_KEY),
      testMode: process.env.NODE_ENV !== 'production',
      webhookEndpoint: 'https://api.aced.live/api/payments/payme'
    },
    firebase: {
      projectId: process.env.FIREBASE_PROJECT_ID || 'Not set',
      configured: !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL)
    },
    cors: {
      allowedOrigins: getAllowedOrigins().length,
      environmentOverride: !!process.env.ALLOWED_ORIGINS
    }
  };

  // Check MongoDB connection
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      healthCheck.database.status = 'connected';
      healthCheck.database.ping = 'successful';
    } else {
      healthCheck.database.status = 'not_connected';
    }
  } catch (error) {
    healthCheck.database.status = 'error';
    healthCheck.database.error = error.message;
  }

  const statusCode = healthCheck.database.status === 'connected' ? 200 : 503;
  res.status(statusCode).json(healthCheck);
};

const authTestHandler = async (req, res) => {
  try {
    // ✅ Import your existing authMiddleware
    const authenticateUser = require('../middlewares/authMiddleware');
    
    // Call the middleware
    authenticateUser(req, res, (err) => {
      if (err) {
        console.error('🔐 Auth test failed:', err.message);
        return res.status(401).json({
          error: 'Authentication failed',
          message: err.message,
          server: 'api.aced.live',
          timestamp: new Date().toISOString()
        });
      }

      // If no error, authentication succeeded
      res.json({
        message: `✅ Authentication successful for ${req.user?.email}`,
        uid: req.user?.uid,
        email: req.user?.email,
        projectId: req.user?.projectId,
        server: 'api.aced.live',
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    console.error('🔐 Auth middleware error:', error.message);
    res.status(500).json({
      error: 'Auth system error',
      message: 'Authentication middleware not available',
      server: 'api.aced.live',
      timestamp: new Date().toISOString()
    });
  }
};

const statusHandler = (req, res) => {
  res.json({
    status: 'API server running',
    server: 'api.aced.live',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    database: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      readyState: mongoose.connection.readyState
    },
    endpoints: {
      health: '/api/health',
      authTest: '/api/auth-test',
      routes: '/api/routes',
      status: '/api/status'
    }
  });
};

module.exports = {
  healthCheckHandler,
  authTestHandler,
  statusHandler
};