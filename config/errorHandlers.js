// config/errorHandlers.js
// ========================================
// 🚨 ERROR HANDLERS CONFIGURATION
// ========================================

const configureErrorHandlers = (app) => {
    // API 404 handler
    app.use('/api/*', (req, res) => {
      console.error(`❌ API Route Not Found: ${req.method} ${req.originalUrl}`);
  
      res.status(404).json({
        error: 'API endpoint not found',
        path: req.originalUrl,
        method: req.method,
        server: 'api.aced.live',
        timestamp: new Date().toISOString(),
        suggestion: 'Check /api/routes for available endpoints'
      });
    });
  
    // Global error handler (must be last)
    app.use((err, req, res, next) => {
      const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2);
      const timestamp = new Date().toISOString();
  
      console.error(`\n🔥 GLOBAL ERROR [${errorId}] at ${timestamp}:`);
      console.error('📍 URL:', req.originalUrl);
      console.error('🔧 Method:', req.method);
      console.error('💬 Message:', err.message);
      console.error('🏷️  Name:', err.name);
      console.error('🔢 Code:', err.code);
  
      if (process.env.NODE_ENV === 'development') {
        console.error('📚 Stack:', err.stack);
      }
  
      // Determine error type and status code
      let statusCode = err.status || err.statusCode || 500;
      let message = 'Internal server error';
      let details = {};
  
      if (err.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation error';
        details.validationErrors = Object.values(err.errors).map(e => e.message);
      } else if (err.name === 'CastError') {
        statusCode = 400;
        message = 'Invalid data format';
        details.field = err.path;
        details.value = err.value;
      } else if (err.code === 11000) {
        statusCode = 409;
        message = 'Duplicate entry';
        details.duplicateField = Object.keys(err.keyValue || {})[0];
      } else if (err.message.includes('CORS')) {
        statusCode = 403;
        message = 'CORS policy violation';
      } else if (err.message.includes('buffering timed out')) {
        statusCode = 503;
        message = 'Database connection timeout';
      } else if (err.message.includes('Firebase') || err.code?.startsWith('auth/')) {
        statusCode = 401;
        message = 'Authentication error';
        details.firebaseError = err.code || err.message;
      } else if (err.message.includes('Too many requests')) {
        statusCode = 429;
        message = 'Rate limit exceeded';
      }
  
      const errorResponse = {
        error: message,
        errorId,
        timestamp,
        server: 'api.aced.live',
        path: req.originalUrl,
        method: req.method
      };
  
      if (Object.keys(details).length > 0) {
        errorResponse.details = details;
      }
  
      if (process.env.NODE_ENV === 'development') {
        errorResponse.debug = {
          message: err.message,
          name: err.name,
          code: err.code,
          stack: err.stack?.split('\n').slice(0, 5)
        };
      }
  
      res.status(statusCode).json(errorResponse);
    });
  };
  
  module.exports = { configureErrorHandlers };