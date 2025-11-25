// middlewares/requestLogger.js
// ========================================
// 🔍 REQUEST LOGGING MIDDLEWARE
// ========================================

const requestLogger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    const isPayMeRequest = req.url.includes('/payme') || req.url.includes('/payment');
    const isProgressRequest = req.url.includes('/progress') || req.url.includes('user-progress');
  
    // Special logging for PayMe requests
    if (isPayMeRequest) {
      const userAgent = req.headers['user-agent'] || '';
      const isBrowser = userAgent.includes('Mozilla') || userAgent.includes('Chrome');
      const isPayMeWebhook = req.headers.authorization?.startsWith('Basic ') &&
                            req.headers['content-type']?.includes('application/json');
  
      if (req.body && Object.keys(req.body).length > 0) {
        console.log(`💳 PayMe Request: ${req.method} ${req.url}`);
        if (process.env.NODE_ENV === 'development') {
          console.log('Body:', JSON.stringify(req.body, null, 2));
        }
      }
    }
  
    // Log POST/PUT request bodies (excluding sensitive data)
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && !isPayMeRequest) {
      const logData = { ...req.body };
      // Remove sensitive fields
      delete logData.password;
      delete logData.privateKey;
      delete logData.token;
      delete logData.card;
  
      if (process.env.NODE_ENV === 'development' && Object.keys(logData).length > 0) {
        console.log(`📝 ${req.method} ${req.url}`, logData);
      }
    }
  
    // Log response time
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (duration > 1000 || res.statusCode >= 400) {
        console.log(`⏱️  ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
      }
    });
  
    next();
  };
  
  module.exports = { requestLogger };