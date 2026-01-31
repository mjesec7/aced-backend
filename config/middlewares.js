// config/middlewares.js
// ========================================
// 🔧 MIDDLEWARE CONFIGURATION
// ========================================

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const { preventInfiniteLoop } = require('../middlewares/loopPrevention');
const { requestLogger } = require('../middlewares/requestLogger');

const configureMiddlewares = (app) => {
  // 1. Loop prevention (MUST BE FIRST)
  app.use(preventInfiniteLoop);

  // 2. Security headers
  app.use(helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: false,
  }));

  // 3. Compression
  app.use(compression());

  // 4. JSON parsing with error handling
  app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf, encoding) => {
      // Store raw body for PayMe webhook verification
      req.rawBody = buf;
      try {
        JSON.parse(buf);
      } catch (e) {
        console.error('❌ Invalid JSON received:', e.message);
        const error = new Error('Invalid JSON format');
        error.status = 400;
        throw error;
      }
    }
  }));

  // 5. URL encoded parsing
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 6. Request logging
  app.use(requestLogger);
};

module.exports = { configureMiddlewares };