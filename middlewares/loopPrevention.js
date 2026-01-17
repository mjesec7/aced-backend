// middlewares/loopPrevention.js
// ========================================
// 🚫 LOOP PREVENTION MIDDLEWARE
// ========================================

const requestTracker = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 15;

const preventInfiniteLoop = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';
  const key = `${clientIP}-${req.url}`;

  // Set CORS headers early
  const origin = req.headers.origin;
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : [
        'https://aced.live',
        'https://www.aced.live',
        'https://api.aced.live',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'https://checkout.paycom.uz',
        'https://checkout.test.paycom.uz',
        'https://checkout.multicard.uz',
        'https://dev-checkout.multicard.uz',
      ];

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  // Check if PayMe webhook vs browser request
  const isPayMeWebhook = req.headers.authorization?.startsWith('Basic ') &&
                        req.headers['content-type']?.includes('application/json') &&
                        req.url === '/api/payments/payme';
  const isBrowserRequest = userAgent.includes('Mozilla') || userAgent.includes('Chrome');

  // Block browser requests to webhook endpoints
  const webhookPaths = ['/api/payments/payme'];
  const isWebhookPath = webhookPaths.some(path => req.url.startsWith(path));

  if (isBrowserRequest && isWebhookPath && !req.headers['x-request-source'] && !isPayMeWebhook) {
    // Silent block - just continue (webhook will handle it)
  }

  // Rate limiting
  const now = Date.now();
  if (!requestTracker.has(key)) {
    requestTracker.set(key, { count: 1, firstRequest: now });
  } else {
    const data = requestTracker.get(key);
    if (now - data.firstRequest < RATE_LIMIT_WINDOW) {
      data.count++;
      if (data.count > MAX_REQUESTS_PER_WINDOW) {
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - data.firstRequest)) / 1000),
          timestamp: new Date().toISOString()
        });
      }
    } else {
      // Reset counter for new window
      requestTracker.set(key, { count: 1, firstRequest: now });
    }
  }

  // Clean old entries
  if (requestTracker.size > 1000) {
    const cutoff = now - RATE_LIMIT_WINDOW;
    for (const [k, v] of requestTracker.entries()) {
      if (v.firstRequest < cutoff) {
        requestTracker.delete(k);
      }
    }
  }

  next();
};

module.exports = { preventInfiniteLoop };