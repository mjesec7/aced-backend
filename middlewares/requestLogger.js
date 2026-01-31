// middlewares/requestLogger.js
// ========================================
// 🔍 REQUEST LOGGING MIDDLEWARE
// ========================================

const requestLogger = (req, res, next) => {
    next();
  };
  
  module.exports = { requestLogger };