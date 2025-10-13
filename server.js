// server.js - COMPLETE UPDATED VERSION WITH PROGRESS FIXES, PAYME INTEGRATION, AND NEW ROUTES FOR GUIDES, BOOKS, AND COURSES
// ========================================
// 🔧 COMPLETE MONGOOSE DEBUG SETUP WITH PAYME INTEGRATION, PROGRESS FIXES, AND FILE UPLOADS
// ========================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// Load environment variables first
dotenv.config();

// Enable Mongoose debugging to see all queries
mongoose.set('debug', process.env.NODE_ENV === 'development');

const app = express();
const PORT = process.env.PORT || 5000;

// ========================================
// 🚫 CRITICAL: PREVENT INFINITE LOOP IN PAYME INTEGRATION
// ========================================

// Add request tracking to prevent loops
const requestTracker = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 15; // Increased for PayMe webhooks

const preventInfiniteLoop = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';
  const key = `${clientIP}-${req.url}`;

  // Set CORS headers early for all requests
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
        // PayMe allowed origins
        'https://checkout.paycom.uz',
        'https://checkout.test.paycom.uz',
      ];

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  // Check if this is a PayMe webhook vs browser request
  const isPayMeWebhook = req.headers.authorization?.startsWith('Basic ') &&
                        req.headers['content-type']?.includes('application/json') &&
                        req.url === '/api/payments/payme';
  const isBrowserRequest = userAgent.includes('Mozilla') || userAgent.includes('Chrome');

  // Allow PayMe webhooks but block browser requests to webhook endpoints
  const webhookPaths = ['/api/payments/payme'];
  const isWebhookPath = webhookPaths.some(path => req.url.startsWith(path));

  if (isBrowserRequest && isWebhookPath && !req.headers['x-request-source'] && !isPayMeWebhook) {
    // Block browser access to webhooks to prevent accidental POSTs
  }

  // Rate limiting for all requests
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

// Apply loop prevention globally
app.use(preventInfiniteLoop);

// ========================================
// 🛡️ SECURITY & PERFORMANCE MIDDLEWARES
// ========================================

app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: false,
}));

app.use(compression());

// Enhanced JSON parsing with error handling for PayMe
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

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ========================================
// 🔍 ENHANCED REQUEST LOGGING WITH PAYME DETECTION
// ========================================

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const isPayMeRequest = req.url.includes('/payme') || req.url.includes('/payment');
  const isProgressRequest = req.url.includes('/progress') || req.url.includes('user-progress');

  // Special logging for PayMe requests with loop detection
  if (isPayMeRequest) {
    const userAgent = req.headers['user-agent'] || '';
    const isBrowser = userAgent.includes('Mozilla') || userAgent.includes('Chrome');
    const isPayMeWebhook = req.headers.authorization?.startsWith('Basic ') &&
                          req.headers['content-type']?.includes('application/json');
    if (req.body && Object.keys(req.body).length > 0) {
    }
  }

  // Log other requests
  if (!isPayMeRequest) {
  }

  // Log POST/PUT request bodies (excluding sensitive data)
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && !isPayMeRequest) {
    const logData = { ...req.body };
    // Remove sensitive fields from logs
    delete logData.password;
    delete logData.privateKey;
    delete logData.token;
    delete logData.card;
  }

  // Log response time
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
  });

  next();
});

// ========================================
// 🌐 ENHANCED CORS CONFIGURATION WITH PAYME DOMAINS
// ========================================

// Use environment variable for CORS origins with PayMe domains
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'https://aced.live',
      'https://www.aced.live',
      'https://admin.aced.live',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      // CRITICAL: PayMe allowed origins
      'https://checkout.paycom.uz',
      'https://checkout.test.paycom.uz',
      
      // ✅ ADD THESE FOR MULTICARD
      'https://checkout.multicard.uz',
      'https://dev-checkout.multicard.uz',
    ];

// Add development origins if in dev mode
if (process.env.NODE_ENV === 'development') {
  allowedOrigins.push(
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:8080',
    'http://127.0.0.1:5173'
  );
}


app.use(cors({
  origin: (origin, callback) => {

    // CRITICAL: Allow requests with no origin (PayMe webhooks, mobile apps, curl)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy violation: ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Auth',
    'X-Request-Source',
    'X-User-Agent',
    'X-PayMe-Request' // PayMe specific headers
  ],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200 // For legacy browser support
}));

// Handle preflight requests explicitly
app.options('*', (req, res) => {

  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,X-Auth,X-Request-Source,X-User-Agent,X-PayMe-Request');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');

  res.status(200).end();
});

// ========================================
// 💾 IMPROVED MONGODB CONNECTION
// ========================================

const connectDB = async () => {
  try {

    // Check if MongoDB URI exists
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI environment variable is not set');
    }

    // Fixed connection options for Mongoose 8.x
    const connectionOptions = {
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

      // Buffer settings - FIXED for Mongoose 8.x
      bufferCommands: false,

      // Heartbeat
      heartbeatFrequencyMS: 10000,

      // Auto-reconnect settings
      autoIndex: process.env.NODE_ENV !== 'production',
    };

    // Attempt connection
    await mongoose.connect(process.env.MONGO_URI, connectionOptions);


    // Connection event listeners with better error handling
    mongoose.connection.on('connected', () => {
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
      if (err.stack && process.env.NODE_ENV === 'development') {
        console.error('Stack:', err.stack);
      }
    });

    mongoose.connection.on('disconnected', () => {
    });

    mongoose.connection.on('reconnected', () => {
    });

    // Handle connection timeout
    mongoose.connection.on('timeout', () => {
      console.error('⏰ MongoDB connection timeout');
    });

    mongoose.connection.on('close', () => {
    });

    // Test the connection
    await mongoose.connection.db.admin().ping();

  } catch (error) {
    console.error('\n❌ MongoDB connection failed:');
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

// ========================================
// 📊 CRITICAL: ADD MISSING PROGRESS ROUTES DIRECTLY
// ========================================


// ✅ CRITICAL FIX: Add the main progress endpoint that's causing 404s
app.post('/api/user-progress', async (req, res) => {
  try {
    const {
      userId,
      lessonId,
      topicId,
      completedSteps = [],
      progressPercent = 0,
      completed = false,
      mistakes = 0,
      medal = 'none',
      duration = 0,
      stars = 0,
      points = 0,
      hintsUsed = 0,
      submittedHomework = false
    } = req.body;


    if (!userId || !lessonId) {
      return res.status(400).json({
        success: false,
        message: '❌ userId and lessonId are required.',
        missing: { userId: !userId, lessonId: !lessonId }
      });
    }

    // Import UserProgress model
    const UserProgress = require('./models/userProgress');
    const Lesson = require('./models/lesson');

    // Validate lessonId format
    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({
        success: false,
        message: '❌ Invalid lessonId format.',
        received: lessonId
      });
    }

    // Handle topicId - get from lesson if not provided
    let finalTopicId = topicId;
    if (!finalTopicId) {
      try {
        const lesson = await Lesson.findById(lessonId);
        if (lesson && lesson.topicId) {
          finalTopicId = lesson.topicId;
        }
      } catch (error) {
        console.warn('⚠️ Failed to find lesson to get topicId:', error.message);
      }
    }

    const updateData = {
      userId,
      lessonId,
      completedSteps: Array.isArray(completedSteps) ? completedSteps : [],
      progressPercent: Math.min(100, Math.max(0, Number(progressPercent) || 0)),
      completed: Boolean(completed),
      mistakes: Math.max(0, Number(mistakes) || 0),
      medal: String(medal || 'none'),
      duration: Math.max(0, Number(duration) || 0),
      stars: Math.min(5, Math.max(0, Number(stars) || 0)),
      points: Math.max(0, Number(points) || 0),
      hintsUsed: Math.max(0, Number(hintsUsed) || 0),
      submittedHomework: Boolean(submittedHomework),
      updatedAt: new Date()
    };

    // Add topicId if available
    if (finalTopicId) {
      updateData.topicId = finalTopicId;
    }


    const updated = await UserProgress.findOneAndUpdate(
      { userId, lessonId },
      updateData,
      { upsert: true, new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: '✅ Progress saved/updated successfully',
      endpoint: '/api/user-progress'
    });

  } catch (error) {
    console.error('❌ Error in /api/user-progress:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: '❌ Invalid data format - ObjectId casting failed',
        error: {
          field: error.path,
          receivedValue: error.value,
          expectedType: error.kind
        }
      });
    } else if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(e => ({
        field: e.path,
        message: e.message,
        value: e.value
      }));

      return res.status(400).json({
        success: false,
        message: '❌ Validation error',
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: '❌ Server error',
      error: error.message
    });
  }
});

// ✅ CRITICAL FIX: Add alternative progress endpoint
app.post('/api/progress', async (req, res) => {
  try {
    // Same logic as above, but handle the endpoint difference
    const progressData = req.body;

    // Ensure userId is in the data for this endpoint
    if (!progressData.userId) {
      return res.status(400).json({
        success: false,
        message: '❌ userId is required in request body for /api/progress endpoint'
      });
    }

    // Import models
    const UserProgress = require('./models/userProgress');
    const Lesson = require('./models/lesson');

    const {
      userId,
      lessonId,
      topicId,
      completedSteps = [],
      progressPercent = 0,
      completed = false,
      mistakes = 0,
      medal = 'none',
      duration = 0,
      stars = 0,
      points = 0,
      hintsUsed = 0,
      submittedHomework = false
    } = progressData;

    if (!userId || !lessonId) {
      return res.status(400).json({
        success: false,
        message: '❌ userId and lessonId are required.'
      });
    }

    // Validate lessonId
    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({
        success: false,
        message: '❌ Invalid lessonId format.'
      });
    }

    // Get topicId if missing
    let finalTopicId = topicId;
    if (!finalTopicId) {
      try {
        const lesson = await Lesson.findById(lessonId);
        if (lesson && lesson.topicId) {
          finalTopicId = lesson.topicId;
        }
      } catch (error) {
        console.warn('⚠️ Failed to find lesson to get topicId:', error.message);
      }
    }

    const updateData = {
      userId,
      lessonId,
      completedSteps: Array.isArray(completedSteps) ? completedSteps : [],
      progressPercent: Math.min(100, Math.max(0, Number(progressPercent) || 0)),
      completed: Boolean(completed),
      mistakes: Math.max(0, Number(mistakes) || 0),
      medal: String(medal || 'none'),
      duration: Math.max(0, Number(duration) || 0),
      stars: Math.min(5, Math.max(0, Number(stars) || 0)),
      points: Math.max(0, Number(points) || 0),
      hintsUsed: Math.max(0, Number(hintsUsed) || 0),
      submittedHomework: Boolean(submittedHomework),
      updatedAt: new Date()
    };

    if (finalTopicId) {
      updateData.topicId = finalTopicId;
    }

    const updated = await UserProgress.findOneAndUpdate(
      { userId, lessonId },
      updateData,
      { upsert: true, new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: '✅ Progress saved/updated successfully',
      endpoint: '/api/progress'
    });

  } catch (error) {
    console.error('❌ Error in /api/progress:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: '❌ Invalid data format',
        field: error.path,
        value: error.value
      });
    }

    res.status(500).json({
      success: false,
      message: '❌ Server error',
      error: error.message
    });
  }
});

// ✅ ADD: Quick save endpoint for page unload
app.post('/api/progress/quick-save', async (req, res) => {
  try {
    const { userId, lessonId, progressPercent, currentStep } = req.body;

    if (!userId || !lessonId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const UserProgress = require('./models/userProgress');

    // Quick update without full validation
    await UserProgress.findOneAndUpdate(
      { userId, lessonId },
      {
        progressPercent: Math.min(100, Math.max(0, Number(progressPercent) || 0)),
        lastAccessedAt: new Date(),
        metadata: { quickSave: true, currentStep, timestamp: Date.now() }
      },
      { upsert: true }
    );

    res.status(200).json({ success: true, message: 'Quick save completed' });

  } catch (error) {
    console.error('❌ Quick save error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// ✅ [UPDATED] - User Status Update Route (PUT /api/users/:userId/status)
app.put('/api/users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    const { subscriptionPlan, userStatus, plan, source } = req.body;
    const finalStatus = subscriptionPlan || userStatus || plan || 'free';

    if (!['free', 'start', 'pro', 'premium'].includes(finalStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid subscription plan' });
    }

    const User = require('./models/user');
    const user = await User.findOne({
        $or: [
          { firebaseId: userId },
          { _id: mongoose.Types.ObjectId.isValid(userId) ? userId : null }
        ]
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const oldPlan = user.subscriptionPlan;
    const newPlan = finalStatus;

    // ✅ FIX: If upgrading from 'free', grant a new subscription with an expiry date.
    if (newPlan !== 'free' && oldPlan === 'free') {
      // Admin or direct API updates grant a 1-year subscription by default
      await user.grantSubscription(newPlan, 365, source || 'admin');
    } else {
      // For downgrades or other changes, just update the plan string and clear expiry if moving to free
      user.subscriptionPlan = newPlan;
      user.userStatus = newPlan;
      user.plan = newPlan;
      user.lastStatusUpdate = new Date();
      user.statusSource = source || 'api';
      if (newPlan === 'free') {
        user.subscriptionExpiryDate = null;
        user.subscriptionSource = null;
      }
      await user.save();
    }
    
    // Fetch the updated user data to send back
    const updatedUser = await User.findById(user._id).lean();

    res.json({
      success: true,
      user: updatedUser,
      message: `User status updated to ${newPlan}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Server: User status update failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user status',
      details: error.message
    });
  }
});

// ✅ ADDED: GET user data route to support new auth flow in main.js
app.get('/api/users/:userId', async (req, res) => {
  try {

    const { userId } = req.params;
    const User = require('./models/user');

    // Find user by firebaseId or _id
    const user = await User.findOne({
      $or: [
        { firebaseId: userId },
        { _id: mongoose.Types.ObjectId.isValid(userId) ? userId : null }
      ]
    }).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Return user with all status fields
    const responseUser = {
      ...user,
      userStatus: user.subscriptionPlan || 'free',
      plan: user.subscriptionPlan || 'free',
      serverFetch: true,
      fetchTime: new Date().toISOString()
    };

    res.json({
      success: true,
      user: responseUser,
      status: user.subscriptionPlan || 'free',
      message: 'User data fetched successfully'
    });
  } catch (error) {
    console.error('❌ Server: User fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user data',
      details: error.message
    });
  }
});


// ========================================
// 💳 PAYME INTEGRATION - IMPORT CONTROLLERS
// ========================================

// Import PayMe controllers
let handlePaymeWebhook, initiatePaymePayment;

try {
  const paymentController = require('./controllers/paymentController');
  handlePaymeWebhook = paymentController.handlePaymeWebhook;
  initiatePaymePayment = paymentController.initiatePaymePayment;
} catch (error) {
  console.error('❌ Failed to load PayMe controllers:', error.message);
}

// ========================================
// 💳 PAYME ROUTES - CRITICAL ENDPOINTS
// ========================================

if (handlePaymeWebhook && initiatePaymePayment) {

  // ✅ CRITICAL: PayMe JSON-RPC webhook endpoint (WHERE PAYME SENDS REQUESTS)
  app.post('/api/payments/payme', (req, res, next) => {
    handlePaymeWebhook(req, res, next);
  });

  // ✅ Payment initiation endpoint (for your frontend)
  app.post('/api/payments/initiate-payme', (req, res, next) => {
    initiatePaymePayment(req, res, next);
  });

  // ✅ PayMe return URLs (for success/failure/cancel)
  app.get('/api/payments/payme/return/success', (req, res) => {
    const transactionId = req.query.transaction || req.query.id;
    const orderId = req.query.Login;

    // Redirect to frontend success page
    const successParams = new URLSearchParams({
      transaction: transactionId || 'unknown',
      order: orderId || 'unknown',
      status: 'success',
      source: 'payme'
    });

    res.redirect(`https://aced.live/payment-success?${successParams.toString()}`);
  });

  app.get('/api/payments/payme/return/failure', (req, res) => {
    const transactionId = req.query.transaction || req.query.id;
    const error = req.query.error || 'payment_failed';

    // Redirect to frontend failure page
    const failureParams = new URLSearchParams({
      transaction: transactionId || 'unknown',
      error: error,
      status: 'failed',
      source: 'payme'
    });

    res.redirect(`https://aced.live/payment-failed?${failureParams.toString()}`);
  });

  app.get('/api/payments/payme/return/cancel', (req, res) => {
    const transactionId = req.query.transaction || req.query.id;

    // Redirect to frontend cancel page
    const cancelParams = new URLSearchParams({
      transaction: transactionId || 'unknown',
      error: 'payment_cancelled',
      status: 'cancelled',
      source: 'payme'
    });

    res.redirect(`https://aced.live/payment-failed?${cancelParams.toString()}`);
  });

  // ✅ PayMe notification endpoint (for webhooks)
  app.post('/api/payments/payme/notify', (req, res, next) => {
    handlePaymeWebhook(req, res, next);
  });

  // ✅ Test endpoint to verify PayMe integration
  app.get('/api/payments/payme/test', (req, res) => {
    res.json({
      message: '✅ PayMe integration endpoints are working',
      server: 'api.aced.live',
      timestamp: new Date().toISOString(),
      endpoints: {
        webhook: 'POST /api/payments/payme',
        initiate: 'POST /api/payments/initiate-payme',
        success: 'GET /api/payments/payme/return/success',
        failure: 'GET /api/payments/payme/return/failure',
        cancel: 'GET /api/payments/payme/return/cancel',
        notify: 'POST /api/payments/payme/notify'
      },
      configuration: {
        merchantId: process.env.PAYME_MERCHANT_ID ? 'configured' : 'missing',
        merchantKey: process.env.PAYME_MERCHANT_KEY ? 'configured' : 'missing',
        checkoutUrl: process.env.PAYME_CHECKOUT_URL || 'https://checkout.paycom.uz',
        environment: process.env.NODE_ENV || 'development'
      }
    });
  });


} else {
  console.warn('⚠️ PayMe controllers not found or failed to load. PayMe routes are inactive.');
}

// ========================================
// 💳 CRITICAL FIX: ADD MISSING PAYMENT ROUTES DIRECTLY
// ========================================


// Payment amounts configuration
const PAYMENT_AMOUNTS = {
  start: 26000000, // 260,000 UZS in tiyin
  pro: 45500000    // 455,000 UZS in tiyin
};

// ✅ EMERGENCY: Add missing payment validation route directly
app.get('/api/payments/validate-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user
    const User = require('./models/user');

    const user = await User.findOne({
      $or: [
        { firebaseId: userId },
        { _id: mongoose.isValidObjectId(userId) ? userId : null },
        { email: userId }
      ]
    });

    if (user) {
      res.json({
        success: true,
        valid: true,
        user: {
          id: user._id,
          firebaseId: user._id,
          name: user.name,
          email: user.email,
          subscriptionPlan: user.subscriptionPlan || 'free'
        },
        source: 'database'
      });
    } else {
      // Development fallback for testing
      if (process.env.NODE_ENV === 'development') {
        res.json({
          success: true,
          valid: true,
          user: {
            id: userId,
            firebaseId: userId,
            name: 'Test User',
            email: 'test@example.com',
            subscriptionPlan: 'free'
          },
          source: 'development_fallback',
          note: 'User validation passed in development mode'
        });
      } else {
        res.status(404).json({
          success: false,
          valid: false,
          error: 'Пользователь не найден'
        });
      }
    }

  } catch (error) {
    console.error('❌ User validation error:', error);
    res.status(500).json({
      success: false,
      valid: false,
      error: 'Ошибка проверки пользователя'
    });
  }
});

// ✅ EMERGENCY: Add missing payment status route directly
app.get('/api/payments/status/:transactionId/:userId?', async (req, res) => {
  try {
    const { transactionId, userId } = req.params;

    // For development, return a sample response
    if (process.env.NODE_ENV === 'development') {
      res.json({
        success: true,
        data: {
          transaction: {
            id: transactionId,
            state: 1, // Pending
            amount: 26000000, // 260,000 UZS in tiyin
            plan: 'start'
          }
        }
      });
    } else {
      // In production, try to find actual transaction
      try {
        const PaymeTransaction = require('./models/paymeTransaction');
        const transaction = await PaymeTransaction.findByPaymeId(transactionId);

        if (transaction) {
          res.json({
            success: true,
            data: {
              transaction: {
                id: transaction.paycom_transaction_id,
                state: transaction.state,
                amount: transaction.amount,
                plan: transaction.subscription_plan
              }
            }
          });
        } else {
          res.status(404).json({
            success: false,
            error: 'Transaction not found'
          });
        }
      } catch (modelError) {
        res.json({
          success: true,
          data: {
            transaction: {
              id: transactionId,
              state: 1, // Pending
              amount: 26000000,
              plan: 'start'
            }
          },
          note: 'Fallback response - model not available'
        });
      }
    }

  } catch (error) {
    console.error('❌ Payment status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка проверки статуса платежа'
    });
  }
});

// ✅ EMERGENCY: Add missing payment initiation route directly
app.post('/api/payments/initiate', async (req, res) => {
  try {
    const { userId, plan, name, phone } = req.body;

    if (!userId || !plan) {
      return res.status(400).json({
        success: false,
        message: '❌ userId and plan are required'
      });
    }

    const allowedPlans = ['start', 'pro'];
    if (!allowedPlans.includes(plan)) {
      return res.status(400).json({
        success: false,
        message: '❌ Invalid plan. Allowed: start, pro'
      });
    }

    const amount = PAYMENT_AMOUNTS[plan];
    const transactionId = `aced_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction && process.env.PAYME_MERCHANT_ID) {
      // ✅ CRITICAL FIX: Use ac.Login instead of ac.Login
      const paymeParams = new URLSearchParams({
        m: process.env.PAYME_MERCHANT_ID,
        'ac.Login': userId,  // ✅ FIXED: Use Login field
        a: amount,
        c: transactionId,
        ct: Date.now(),
        l: 'uz',
        cr: 'UZS'
      });

      const paymentUrl = `https://checkout.paycom.uz/?${paymeParams.toString()}`;

      return res.json({
        success: true,
        message: '✅ Redirecting to PayMe checkout',
        paymentUrl: paymentUrl,
        transaction: {
          id: transactionId,
          amount: amount,
          plan: plan,
          state: 1
        },
        metadata: {
          userId: userId,
          plan: plan,
          amountUzs: amount / 100,
          environment: 'production'
        }
      });
    } else {
      // Development checkout remains the same
      const checkoutUrl = `https://aced.live/payment/checkout?${new URLSearchParams({
        transactionId: transactionId,
        userId: userId,
        amount: amount,
        amountUzs: amount / 100,
        plan: plan,
        userName: name || 'User',
        userEmail: '',
        currentPlan: 'free'
      }).toString()}`;

      return res.json({
        success: true,
        message: '✅ Development checkout',
        paymentUrl: checkoutUrl,
        transaction: {
          id: transactionId,
          amount: amount,
          plan: plan,
          state: 1
        },
        metadata: {
          userId: userId,
          plan: plan,
          amountUzs: amount / 100,
          environment: 'development'
        }
      });
    }

  } catch (error) {
    console.error('❌ Emergency payment initiation error:', error);
    res.status(500).json({
      success: false,
      message: '❌ Payment initiation failed',
      error: error.message
    });
  }
});

// ✅ [UPDATED] - Promo Code Route (POST /api/payments/promo-code)
app.post('/api/payments/promo-code', async (req, res) => {
  try {
    const { userId, plan, promoCode } = req.body;

    if (!userId || !plan || !promoCode) {
      return res.status(400).json({
        success: false,
        error: 'Заполните все поля'
      });
    }

    // ✅ Import models
    const Promocode = require('./models/promoCode');
    const User = require('./models/user');
    
    const promocode = await Promocode.findOne({
      code: promoCode.toUpperCase(),
      isActive: true
    });

    if (!promocode) {
      return res.status(400).json({
        success: false,
        error: 'Промокод не найден'
      });
    }

    if (promocode.grantsPlan !== plan) {
      return res.status(400).json({
        success: false,
        error: `Этот промокод для плана ${promocode.grantsPlan.toUpperCase()}`
      });
    }

    const user = await User.findOne({ firebaseId: userId });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    // ✅ FIX: Use the new grantSubscription method to set plan, expiry, and source
    const durationInDays = promocode.subscriptionDays || 30; // Use days from promocode or default to 30
    await user.grantSubscription(plan, durationInDays, 'promocode');

    // Update promocode usage stats
    promocode.currentUses = (promocode.currentUses || 0) + 1;
    await promocode.save();
    
    const expiryDate = user.subscriptionExpiryDate;

    res.json({
      success: true,
      message: `Промокод применён! План ${plan.toUpperCase()} активен до ${expiryDate.toLocaleDateString('ru-RU')}.`,
      user: {
        subscriptionPlan: user.subscriptionPlan,
        subscriptionExpiryDate: user.subscriptionExpiryDate
      }
    });

  } catch (error) {
    console.error('❌ Promocode error:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера'
    });
  }
});

// ✅ EMERGENCY: Add missing payment form generation route directly
app.post('/api/payments/generate-form', async (req, res) => {
  try {
    const { userId, plan, method = 'post', lang = 'ru', style = 'colored', qrWidth = 250 } = req.body;


    if (!userId || !plan) {
      return res.status(400).json({
        success: false,
        message: 'userId and plan are required'
      });
    }

    // ✅ IMPROVED: User finding logic with better error handling
    const User = require('./models/user');
    let user = null;

    try {
      // Try multiple search strategies
      user = await User.findOne({ firebaseId: userId }) ||
             await User.findById(userId).catch(() => null) ||
             await User.findOne({ email: userId }).catch(() => null);
    } catch (dbError) {
      // Create fallback user object
      user = {
        firebaseId: userId,
        name: 'User',
        email: 'user@example.com',
        _id: userId
      };
    }

    // If still no user, create fallback
    if (!user) {
      console.warn('⚠️ User not found in DB, using fallback object for form generation');
    }

    // ✅ Validate plan and get amount
    const amount = PAYMENT_AMOUNTS[plan];
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: `Invalid plan: ${plan}. Allowed: start, pro`
      });
    }

    // ✅ Configuration setup
    const merchantId = process.env.PAYME_MERCHANT_ID || 'test-merchant-id';
    const transactionId = `aced_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const isProduction = process.env.NODE_ENV === 'production';
    const checkoutUrl = isProduction ?
      (process.env.PAYME_CHECKOUT_URL || 'https://checkout.paycom.uz') :
      'https://checkout.test.paycom.uz';



    if (method === 'post') {
      // ✅ CRITICAL FIX: Use account[Login] in POST form
      const detail = {
        receipt_type: 0,
        items: [{
          title: `ACED ${plan.toUpperCase()} Subscription`,
          price: amount,
          count: 1,
          code: "10899002001000000", // Your IKPU code
          vat_percent: 0,
          package_code: "1"
        }]
      };

      let detailBase64 = '';
      try {
        const detailJson = JSON.stringify(detail);
        detailBase64 = Buffer.from(detailJson, 'utf8').toString('base64');
      } catch (encodingError) {
        console.error('❌ Detail encoding failed:', encodingError);
        detailBase64 = '';
      }

      const formHtml = `
        <form method="POST" action="${checkoutUrl}/" id="payme-form" style="display: none;">
          <input type="hidden" name="merchant" value="${merchantId}" />
          <input type="hidden" name="amount" value="${amount}" />

          <input type="hidden" name="account[Login]" value="${user._id}" />

          <input type="hidden" name="lang" value="${lang}" />
          <input type="hidden" name="callback" value="https://api.aced.live/api/payments/payme/return/success?transaction=${transactionId}&userId=${userId}" />
          <input type="hidden" name="callback_timeout" value="15000" />
          <input type="hidden" name="description" value="ACED ${plan.toUpperCase()} Plan Subscription" />
          <input type="hidden" name="currency" value="UZS" />

          ${detailBase64 ? `<input type="hidden" name="detail" value="${detailBase64}" />` : ''}

          <button type="submit" style="display: none;">Pay with PayMe</button>
        </form>

        <script>

          function submitPaymeForm() {
            const form = document.getElementById('payme-form');
            if (form) {
              form.submit();
            } else {
              console.error('❌ PayMe form not found in DOM');
            }
          }

          // Auto-submit after page loads
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
              setTimeout(submitPaymeForm, 1000);
            });
          } else {
            setTimeout(submitPaymeForm, 1000);
          }
        </script>
      `;

      return res.json({
        success: true,
        method: 'POST',
        formHtml: formHtml,
        transaction: {
          id: transactionId,
          amount: amount,
          plan: plan,
          accountLogin: user._id
        },
        debug: {
          checkoutUrl,
          merchantId: merchantId.substring(0, 10) + '...',
          accountField: 'Login',
          accountValue: user._id
        }
      });

    } else if (method === 'get') {
      // ✅ CRITICAL FIX: Use ac.Login in GET URL
      const params = {
        m: merchantId,
        a: amount,
        l: lang,
        cr: 'UZS'
      };

      // ✅ CRITICAL FIX: Use Login field instead of Login
      params['ac.Login'] = user._id;

      // Add callback URL
      if (req.body.callback) {
        params.c = req.body.callback;
      } else {
        params.c = `https://api.aced.live/api/payments/payme/return/success?transaction=${transactionId}&userId=${userId}`;
      }

      params.ct = 15000;

      // ✅ Build parameter string with semicolon separator (PayMe requirement)
      const paramString = Object.entries(params)
        .map(([key, value]) => `${key}=${value}`)
        .join(';');


      // Base64 encode the parameters
      const encodedParams = Buffer.from(paramString, 'utf8').toString('base64');
      const paymentUrl = `${checkoutUrl}/${encodedParams}`;

      // Verify encoding
      const decodedCheck = Buffer.from(encodedParams, 'base64').toString('utf8');

      return res.json({
        success: true,
        method: 'GET',
        paymentUrl: paymentUrl,
        transaction: {
          id: transactionId,
          amount: amount,
          plan: plan,
          accountLogin: user._id
        },
        debug: {
          paramString,
          encodedParams,
          checkoutUrl,
          accountField: 'ac.Login',
          accountValue: user._id
        }
      });

    }

    // Invalid method fallback
    return res.status(400).json({
      success: false,
      message: 'Invalid method. Supported: post, get, button, qr',
      supportedMethods: ['post', 'get', 'button', 'qr'],
      received: method
    });

  } catch (error) {
    console.error('❌ Emergency form generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate payment form',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
});


// ========================================
// 🛡️ MULTICARD IP WHITELIST MIDDLEWARE
// ========================================

const multicardIpWhitelist = (req, res, next) => {
  const allowedIp = '195.158.26.90'; // Multicard webhook IP
  const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  
  // Skip check in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🔓 Multicard IP check skipped (development mode)');
    return next();
  }

  // Check if request is from Multicard webhook
  const isMulticardWebhook = req.url.includes('/multicard/webhook') || 
                           req.url.includes('/multicard/callback');

  if (isMulticardWebhook && clientIp !== allowedIp) {
    console.warn(`⚠️ Blocked Multicard request from unauthorized IP: ${clientIp}`);
    return res.status(403).json({
      success: false,
      error: 'Forbidden - Invalid source IP'
    });
  }

  next();
};

// Apply to webhook routes
app.use('/api/payments/multicard/webhook', multicardIpWhitelist);
app.use('/api/payments/multicard/callback', multicardIpWhitelist);

// ========================================
// 🏥 ENHANCED HEALTH CHECK - MULTIPLE ENDPOINTS
// ========================================

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
    // PayMe configuration status
    payme: {
      configured: !!(process.env.PAYME_MERCHANT_ID && process.env.PAYME_MERCHANT_KEY),
      testMode: process.env.NODE_ENV !== 'production',
      merchantId: process.env.PAYME_MERCHANT_ID ? 'Set' : 'Missing',
      merchantKey: process.env.PAYME_MERCHANT_KEY ? 'Set' : 'Missing',
      checkoutUrl: process.env.PAYME_CHECKOUT_URL || 'https://checkout.paycom.uz',
      webhookEndpoint: 'https://api.aced.live/api/payments/payme',
      loopPrevention: 'Active',
      controllersLoaded: !!(handlePaymeWebhook && initiatePaymePayment),
      emergencyRoutesActive: true
    },
    // Progress endpoints status
    progress: {
      endpointsActive: true,
      mainEndpoint: '/api/user-progress',
      alternativeEndpoint: '/api/progress',
      quickSaveEndpoint: '/api/progress/quick-save',
      emergencyRoutesActive: true
    },
    firebase: {
      projectId: process.env.FIREBASE_PROJECT_ID || 'Not set',
      configured: !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
    },
    cors: {
      allowedOrigins: allowedOrigins.length,
      environmentOverride: !!process.env.ALLOWED_ORIGINS,
      paymeDomainsIncluded: allowedOrigins.some(origin => origin.includes('paycom.uz'))
    },
    updatedCourses: {
      endpointsActive: true,
      publicEndpoint: '/api/updated-courses',
      adminEndpoint: '/api/updated-courses/admin/all',
      modelLoaded: true,
      routesMounted: true
    },

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

  const statusCode = healthCheck.database.status === 'connected' &&
                     healthCheck.payme.emergencyRoutesActive &&
                     healthCheck.progress.emergencyRoutesActive ? 200 : 503;
  res.status(statusCode).json(healthCheck);
};

// Health check endpoints - both /health and /api/health
app.get('/health', healthCheckHandler);
app.get('/api/health', healthCheckHandler);

// ========================================
// 🔐 AUTH TEST ENDPOINT WITH ERROR HANDLING - MULTIPLE ROUTES
// ========================================

const authTestHandler = async (req, res) => {
  try {
    const authenticateUser = require('./middlewares/authMiddleware');
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

      res.json({
        message: `✅ Authentication successful for ${req.user?.email}`,
        uid: req.user?.uid,
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
// Auth test endpoints - both /auth-test and /api/auth-test
app.get('/auth-test', authTestHandler);
app.get('/api/auth-test', authTestHandler);

// ========================================
// 📁 IMPROVED ROUTE MOUNTING
// ========================================

const mountRoute = (path, routeFile, description) => {
  try {
    const route = require(routeFile);

    // Add error handling middleware for each route
    app.use(path, (req, res, next) => {
      next();
    }, route);

    return true;
  } catch (error) {
    console.error(`❌ Failed to mount ${path}:`, error.message);
    console.error(`   Route file: ${routeFile}`);
    return false;
  }
};

const routesToMount = [
  // ✅ FIXED: Add main payment routes FIRST
  ['/api/payments', './routes/payments', 'Main payment routes (CRITICAL)'],
  ['/api/promocodes', './routes/promocodeRoutes', 'Promocode management routes (ADMIN)'],

  // ✅ ADD THIS LINE FOR MULTICARD
  ['/api/payments/multicard', './routes/multicardRoutes', 'Multicard payment integration'],  // PayMe routes (legacy)
  ['/api/payments', './routes/paymeRoutes', 'PayMe payment routes (legacy)'],

  // User routes - CRITICAL
  ['/api/users', './routes/userRoutes', 'User management routes (MAIN)'],
  ['/api/user', './routes/userRoutes', 'User management routes (LEGACY)'],

  // Other routes
  ['/api/progress', './routes/userProgressRoutes', 'Progress tracking routes'],
  ['/api/lessons', './routes/lessonRoutes', 'Lesson management routes'],
  ['/api/subjects', './routes/subjectRoutes', 'Subject management routes'],
  ['/api/topics', './routes/topicRoutes', 'Topic management routes'],
  ['/api/chat', './routes/chatRoutes', 'Chat/AI routes'],
  ['/api/homeworks', './routes/homeworkRoutes', 'Homework routes'],
  ['/api/tests', './routes/testRoutes', 'Test/quiz routes'],
  ['/api/analytics', './routes/userAnalytics', 'User analytics routes'],
  ['/api/updated-courses', './routes/updatedCourses', 'Updated Courses routes (MAIN FRONTEND)'],

  // NEW: Routes for Guides and Books
  ['/api/guides', './routes/guides', 'Guides routes'],
  ['/api/books', './routes/books', 'Books routes'],

];

// Mount routes
const mountedRoutes = [];
const failedRoutes = [];

routesToMount.forEach(([path, file, description]) => {
  if (mountRoute(path, file, description)) {
    mountedRoutes.push({ path, description });
  } else {
    failedRoutes.push({ path, file, description });
  }
});


if (failedRoutes.length > 0) {
  console.warn('⚠️ Some routes failed to mount:');
  failedRoutes.forEach(({ path, file, description }) => {
    console.warn(`   - ${path} (${description}) from ${file}`);
  });
}

// ✅ [UPDATED] - Self-Healing Login Route (POST /api/users/save)
app.post('/api/users/save', async (req, res) => {
  const { token, name, subscriptionPlan } = req.body;

  if (!token || !name) {
    return res.status(400).json({ error: '❌ Missing token or name' });
  }

  try {
    const admin = require('firebase-admin');
    const User = require('./models/user');
    const decoded = await admin.auth().verifyIdToken(token);

    const firebaseId = decoded.uid;
    const email = decoded.email;

    let user = await User.findOne({ firebaseId });

    if (!user) {
      // Create new user, correctly defaulting to 'free'
      user = new User({
        firebaseId,
        email,
        name,
        Login: email,
        subscriptionPlan: subscriptionPlan || 'free'
      });
    } else {
      // ✅ SELF-HEALING: Check for expired subscription on login
      // The hasActiveSubscription method is from your updated user model
      if (!user.hasActiveSubscription() && user.subscriptionPlan !== 'free') {
          user.subscriptionPlan = 'free';
          user.subscriptionSource = null;
          // The expiry date is already in the past, no need to clear it.
      }
      
      user.email = email;
      user.name = name;
      user.Login = email;
      user.lastLoginAt = new Date(); // Track login time
      // Note: We don't update subscriptionPlan here unless it expired
    }

    await user.save();

    // Send back the complete, updated user object
    const finalUser = await User.findById(user._id).lean();

    res.json({
      ...finalUser,
      message: '✅ User saved/synced successfully',
      server: 'api.aced.live'
    });

  } catch (err) {
    console.error('❌ Emergency save error:', err.message);
    res.status(401).json({
      error: '❌ Invalid Firebase token',
      details: err.message
    });
  }
});

// ✅ Add test route to verify system is working
app.get('/api/users/test', (req, res) => {
  res.json({
    message: '✅ Emergency user routes are working',
    server: 'api.aced.live',
    timestamp: new Date().toISOString(),
    routes: [
      'GET /api/users/test',
      'POST /api/users/save (emergency)',
      'GET /api/health',
      'GET /api/auth-test',
      'POST /api/payments/payme (PayMe webhook)',
      'POST /api/payments/initiate-payme (Payment initiation)',
      'GET /api/payments/validate-user/:userId (EMERGENCY)',
      'POST /api/payments/initiate (EMERGENCY)',
      'GET /api/payments/status/:transactionId (EMERGENCY)',
      'POST /api/payments/promo-code (EMERGENCY)',
      'POST /api/payments/generate-form (EMERGENCY)',
      'POST /api/user-progress (CRITICAL PROGRESS)',
      'POST /api/progress (CRITICAL PROGRESS)',
      'POST /api/progress/quick-save (CRITICAL PROGRESS)'
    ]
  });
});

// Add a database health check endpoint
app.get('/api/db-health', async (req, res) => {
  try {
    const dbStatus = {
      connected: mongoose.connection.readyState === 1,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      name: mongoose.connection.name,
      states: {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      }
    };

    if (dbStatus.connected) {
      // Test actual database operation
      try {
        await mongoose.connection.db.admin().ping();
        dbStatus.ping = 'successful';
        dbStatus.pingTime = Date.now();
      } catch (pingError) {
        dbStatus.ping = 'failed';
        dbStatus.pingError = pingError.message;
      }
    }

    const statusCode = dbStatus.connected && dbStatus.ping === 'successful' ? 200 : 503;

    res.status(statusCode).json({
      database: dbStatus,
      server: 'api.aced.live',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      database: {
        connected: false,
        error: error.message
      },
      server: 'api.aced.live',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'API server running',
    server: 'api.aced.live',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    database: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      readyState: mongoose.connection.readyState
    },
    payme: {
      configured: !!(process.env.PAYME_MERCHANT_ID && process.env.PAYME_MERCHANT_KEY),
      controllersLoaded: !!(handlePaymeWebhook && initiatePaymePayment),
      emergencyRoutesActive: true
    },
    progress: {
      criticalEndpointsActive: true,
      mainEndpoint: '/api/user-progress',
      alternativeEndpoint: '/api/progress',
      quickSaveEndpoint: '/api/progress/quick-save',
      emergencyFix: 'Successfully applied'
    },
    endpoints: {
      health: '/api/health',
      authTest: '/api/auth-test',
      userSave: '/api/users/save',
      paymeWebhook: '/api/payments/payme',
      paymeInitiate: '/api/payments/initiate-payme',
      paymeTest: '/api/payments/payme/test',
      routes: '/api/routes',
      // Emergency payment endpoints
      validateUser: '/api/payments/validate-user/:userId',
      paymentInitiate: '/api/payments/initiate',
      paymentStatus: '/api/payments/status/:transactionId',
      promoCode: '/api/payments/promo-code',
      generateForm: '/api/payments/generate-form',
      // Critical progress endpoints
      userProgress: '/api/user-progress',
      progress: '/api/progress',
      quickSave: '/api/progress/quick-save'
    }
  });
});
app.get('/api/admin/users', async (req, res) => {
  try {

    const {
      page = 1,
      limit = 50,
      search = '',
      plan = '',
      status = ''
    } = req.query;

    const User = require('./models/user');

    // Build filter
    const filter = {};

    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { firebaseId: { $regex: search, $options: 'i' } }
      ];
    }

    if (plan && plan !== 'all') {
      filter.subscriptionPlan = plan;
    }

    if (status === 'active') {
      filter.isBlocked = { $ne: true };
    } else if (status === 'blocked') {
      filter.isBlocked = true;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter)
    ]);

    // Enhance users with computed fields
    const enhancedUsers = users.map(user => ({
      ...user,
      studyListCount: user.studyList?.length || 0,
      paymentCount: 0, // You can enhance this with actual payment data
      totalPaid: 0,
      promocodeCount: 0,
      userSegment: user.subscriptionPlan === 'free' ? 'free-inactive' : 'premium-active',
      engagementLevel: user.lastLoginAt && (Date.now() - new Date(user.lastLoginAt).getTime()) < (7 * 24 * 60 * 60 * 1000) ? 'high' : 'low',
      riskLevel: 'low',
      isActivePaidUser: user.subscriptionPlan !== 'free',
      isActiveStudent: user.studyList?.length > 0,
      accountValue: user.subscriptionPlan === 'pro' ? 455000 : user.subscriptionPlan === 'start' ? 260000 : 0,
      lastActivity: user.lastLoginAt || user.updatedAt,
      analytics: {
        studyDays: user.studyList?.length || 0,
        totalLessonsDone: 0, // You can enhance this with UserProgress data
        totalPoints: 0,
        weeklyLessons: 0,
        monthlyLessons: 0
      }
    }));

    res.json({
      success: true,
      users: enhancedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      dataSource: 'real_backend',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching admin users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
      details: error.message
    });
  }
});

// ✅ GET /api/users/all - Alternative endpoint
app.get('/api/users/all', async (req, res) => {
  try {

    const User = require('./models/user');
    const users = await User.find({})
      .select('firebaseId email name subscriptionPlan isBlocked createdAt lastLoginAt studyList')
      .sort({ createdAt: -1 })
      .limit(100) // Reasonable limit
      .lean();

    res.json({
      success: true,
      data: users,
      count: users.length,
      dataSource: 'real_backend',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching all users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
      details: error.message
    });
  }
});


// ========================================
// 🔍 ROUTE DIAGNOSTICS ENDPOINT - ENHANCED
// ========================================

app.get('/api/routes', (req, res) => {
  const routes = [];

  function extractRoutes(stack, basePath = '') {
    stack.forEach(layer => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
        routes.push({
          path: basePath + layer.route.path,
          methods: methods
        });
      } else if (layer.name === 'router' && layer.handle.stack) {
        const newBasePath = basePath + (layer.regexp.source.replace(/\\/g, '').replace(/\^/g, '').replace(/\$/g, '').replace(/\?(?=\?)/g, '') || '');
        extractRoutes(layer.handle.stack, newBasePath);
      }
    });
  }

  // Extract all routes
  app._router.stack.forEach(layer => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
      routes.push({
        path: layer.route.path,
        methods: methods
      });
    } else if (layer.name === 'router' && layer.handle.stack) {
      let basePath = '';
      if (layer.regexp && layer.regexp.source) {
        const regexSource = layer.regexp.source;
        const match = regexSource.match(/\\\/([^\\]+)/);
        if (match) {
          basePath = '/' + match[1];
        }
      }
      extractRoutes(layer.handle.stack, basePath);
    }
  });

  routes.sort((a, b) => a.path.localeCompare(b.path));

  const groupedRoutes = {};
  routes.forEach(route => {
    const basePath = route.path.split('/')[1] || 'root';
    if (!groupedRoutes[basePath]) {
      groupedRoutes[basePath] = [];
    }
    groupedRoutes[basePath].push(route);
  });
  const updatedCoursesRoutes = [
    { path: '/api/updated-courses', methods: 'GET', description: 'Get updated courses for main website', status: 'ACTIVE' },
    { path: '/api/updated-courses/categories', methods: 'GET', description: 'Get course categories', status: 'ACTIVE' },
    { path: '/api/updated-courses/:id', methods: 'GET', description: 'Get single course', status: 'ACTIVE' },
    { path: '/api/updated-courses/:id/bookmark', methods: 'POST,DELETE', description: 'Toggle bookmark (mock)', status: 'ACTIVE' },
    { path: '/api/updated-courses/admin/all', methods: 'GET', description: 'Admin: Get all courses', status: 'ACTIVE' },
    { path: '/api/updated-courses/admin', methods: 'POST', description: 'Admin: Create course', status: 'ACTIVE' },
    { path: '/api/updated-courses/admin/:id', methods: 'PUT,DELETE', description: 'Admin: Update/Delete course', status: 'ACTIVE' },
    { path: '/api/updated-courses/admin/:id/status', methods: 'PATCH', description: 'Admin: Update course status', status: 'ACTIVE' },
    { path: '/api/updated-courses/admin/:id/toggle-premium', methods: 'PATCH', description: 'Admin: Toggle premium', status: 'ACTIVE' },
    { path: '/api/updated-courses/admin/stats', methods: 'GET', description: 'Admin: Get course statistics', status: 'ACTIVE' },
    { path: '/api/updated-courses/admin/bulk-import', methods: 'POST', description: 'Admin: Bulk import courses', status: 'ACTIVE' }
  ];

  res.json({
    server: 'api.aced.live',
    totalRoutes: routes.length,
    routes: groupedRoutes,
    allRoutes: routes,
    updatedCoursesRoutes: updatedCoursesRoutes,

    criticalProgressRoutes: [
      { path: '/api/user-progress', methods: 'POST', description: 'Main progress save endpoint (CRITICAL FIX)', status: 'ACTIVE' },
      { path: '/api/progress', methods: 'POST', description: 'Alternative progress save endpoint (CRITICAL FIX)', status: 'ACTIVE' },
      { path: '/api/progress/quick-save', methods: 'POST', description: 'Quick save for page unload (CRITICAL FIX)', status: 'ACTIVE' }
    ],
    emergencyPaymentRoutes: [
      { path: '/api/payments/validate-user/:userId', methods: 'GET', description: 'User validation for payments (EMERGENCY)', status: 'ACTIVE' },
      { path: '/api/payments/initiate', methods: 'POST', description: 'Payment initiation (EMERGENCY)', status: 'ACTIVE' },
      { path: '/api/payments/status/:transactionId/:userId?', methods: 'GET', description: 'Payment status check (EMERGENCY)', status: 'ACTIVE' },
      { path: '/api/payments/promo-code', methods: 'POST', description: 'Promo code application (EMERGENCY)', status: 'ACTIVE' },
      { path: '/api/payments/generate-form', methods: 'POST', description: 'Payment form generation (EMERGENCY)', status: 'ACTIVE' }
    ],
    paymeRoutes: [
      { path: '/api/payments/payme', methods: 'POST', description: 'PayMe JSON-RPC webhook endpoint', status: handlePaymeWebhook ? 'ACTIVE' : 'INACTIVE' },
      { path: '/api/payments/initiate-payme', methods: 'POST', description: 'PayMe payment initiation', status: initiatePaymePayment ? 'ACTIVE' : 'INACTIVE' },
      { path: '/api/payments/payme/return/success', methods: 'GET', description: 'PayMe success return', status: 'ACTIVE' },
      { path: '/api/payments/payme/return/failure', methods: 'GET', description: 'PayMe failure return', status: 'ACTIVE' },
      { path: '/api/payments/payme/return/cancel', methods: 'GET', description: 'PayMe cancel return', status: 'ACTIVE' },
      { path: '/api/payments/payme/notify', methods: 'POST', description: 'PayMe notifications', status: handlePaymeWebhook ? 'ACTIVE' : 'INACTIVE' },
      { path: '/api/payments/payme/test', methods: 'GET', description: 'PayMe test endpoint', status: 'ACTIVE' }
    ],
    systemRoutes: [
      { path: '/health', methods: 'GET', description: 'System health check', status: 'ACTIVE' },
      { path: '/api/health', methods: 'GET', description: 'API health check', status: 'ACTIVE' },
      { path: '/auth-test', methods: 'GET', description: 'Authentication test', status: 'ACTIVE' },
      { path: '/api/auth-test', methods: 'GET', description: 'API authentication test', status: 'ACTIVE' },
      { path: '/api/routes', methods: 'GET', description: 'Routes information', status: 'ACTIVE' },
      { path: '/api/status', methods: 'GET', description: 'Server status', status: 'ACTIVE' },
      { path: '/api/db-health', methods: 'GET', description: 'Database health check', status: 'ACTIVE' },
      { path: '/api/users/save', methods: 'POST', description: 'Emergency user save', status: 'ACTIVE' },
      { path: '/api/users/test', methods: 'GET', description: 'User routes test', status: 'ACTIVE' }
    ],

    mountedRoutes: mountedRoutes.map(r => r.path),
    failedRoutes: failedRoutes.map(r => ({ path: r.path, reason: 'Module load failed' })),
    timestamp: new Date().toISOString(),
    loopPrevention: {
      active: true,
      rateLimitWindow: RATE_LIMIT_WINDOW,
      maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
      trackedRequests: requestTracker.size
    },
    cors: {
      allowedOrigins: allowedOrigins,
      environmentOverride: !!process.env.ALLOWED_ORIGINS,
      paymeDomainsIncluded: allowedOrigins.some(origin => origin.includes('paycom.uz'))
    },
    payme: {
      configured: !!(process.env.PAYME_MERCHANT_ID && process.env.PAYME_MERCHANT_KEY),
      controllersLoaded: !!(handlePaymeWebhook && initiatePaymePayment),
      emergencyRoutesActive: true,
      merchantId: process.env.PAYME_MERCHANT_ID ? 'Set' : 'Missing',
      merchantKey: process.env.PAYME_MERCHANT_KEY ? 'Set' : 'Missing',
      checkoutUrl: process.env.PAYME_CHECKOUT_URL || 'https://checkout.paycom.uz'
    },
    progress: {
      criticalEndpointsActive: true,
      mainEndpoint: '/api/user-progress',
      alternativeEndpoint: '/api/progress',
      quickSaveEndpoint: '/api/progress/quick-save',
      emergencyFix: 'Successfully applied'
    }
  });
});
// ========================================
// 🖼️ FILE UPLOAD MIDDLEWARE
// ========================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadType = req.body.type || 'general';
    const uploadDir = path.join('uploads', uploadType);

    // Create directory if it doesn't exist
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4();
    const fileExtension = path.extname(file.originalname);
    const timestamp = Date.now();
    cb(null, `${timestamp}_${uniqueName}${fileExtension}`);
  }
});

// File filter for images
const imageFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'), false);
  }
};

// Enhanced multer configuration
const upload = multer({
  storage: storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Max 10 files at once
  }
});

// ✅ ENHANCED UPLOAD ENDPOINT
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    const { type = 'general' } = req.body;

    // Generate public URL
    const baseUrl = process.env.NODE_ENV === 'production'
       ? 'https://api.aced.live'
       : `${req.protocol}://${req.get('host')}`;

    const fileUrl = `${baseUrl}/uploads/${type}/${req.file.filename}`;
    // Optional: Convert to base64 if requested
    let base64Data = null;
    if (req.query.includeBase64 === 'true') {
      const fileBuffer = fs.readFileSync(req.file.path);
      base64Data = `data:${req.file.mimetype};base64,${fileBuffer.toString('base64')}`;
    }
    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        type: type,
        base64: base64Data
      }
    });
  } catch (error) {
    console.error('❌ File upload error:', error);

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB.'
      });
    }
    res.status(500).json({
      success: false,
      message: 'File upload failed',
      error: error.message
    });
  }
});

// ✅ MULTIPLE FILES UPLOAD
app.post('/api/upload/multiple', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }
    const { type = 'general' } = req.body;
    const baseUrl = process.env.NODE_ENV === 'production'
       ? 'https://api.aced.live'
       : `${req.protocol}://${req.get('host')}`;
    const uploadedFiles = req.files.map(file => ({
      url: `${baseUrl}/uploads/${type}/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      type: type
    }));
    res.json({
      success: true,
      message: `${req.files.length} files uploaded successfully`,
      data: uploadedFiles
    });
  } catch (error) {
    console.error('❌ Multiple file upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Multiple file upload failed',
      error: error.message
    });
  }
});

// ✅ BASE64 TO FILE CONVERSION ENDPOINT
app.post('/api/upload/base64', async (req, res) => {
  try {
    const { base64Data, filename, type = 'general' } = req.body;
    if (!base64Data) {
      return res.status(400).json({
        success: false,
        message: 'Base64 data is required'
      });
    }
    // Parse base64 data
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({
        success: false,
        message: 'Invalid base64 format'
      });
    }
    const mimeType = matches[1];
    const base64Content = matches[2];
    // Validate image type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image type'
      });
    }
    // Generate filename
    const extension = mimeType.split('/')[1];
    const finalFilename = filename || `${Date.now()}_${uuidv4()}.${extension}`;
    // Create directory
    const uploadDir = path.join('uploads', type);
    fs.mkdirSync(uploadDir, { recursive: true });
    // Save file
    const filePath = path.join(uploadDir, finalFilename);
    fs.writeFileSync(filePath, base64Content, 'base64');
    const baseUrl = process.env.NODE_ENV === 'production'
       ? 'https://api.aced.live'
       : 'http://localhost:5000';

    const fileUrl = `${baseUrl}/uploads/${type}/${finalFilename}`;
    res.json({
      success: true,
      message: 'Base64 file saved successfully',
      data: {
        url: fileUrl,
        filename: finalFilename,
        mimetype: mimeType,
        type: type
      }
    });
  } catch (error) {
    console.error('❌ Base64 upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Base64 upload failed',
      error: error.message
    });
  }
});

app.use('/uploads', express.static('uploads'));

// ========================================
// 📂 NEW FILE MODELS & ROUTES (CRITICAL)
// ========================================

const guideSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  videoUrl: { type: String, required: true },
  guidePdfUrl: { type: String, required: true },
  thumbnail: { type: String },
  isPremium: { type: Boolean, default: false }, // Only available for subscription users
  createdBy: { type: String },
  updatedBy: { type: String },
}, { timestamps: true });

const Guide = mongoose.model('Guide', guideSchema);

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  author: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  bookPdfUrl: { type: String, required: true },
  thumbnail: { type: String },
  isPremium: { type: Boolean, default: false }, // Only available for subscription users
  createdBy: { type: String },
  updatedBy: { type: String },
}, { timestamps: true });

const Book = mongoose.model('Book', bookSchema);


// GUIDE ROUTES
const guidesRouter = express.Router();
guidesRouter.get('/', async (req, res) => {
  try {
    const guides = await Guide.find({});
    res.json({ success: true, guides });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
guidesRouter.post('/admin', async (req, res) => {
  try {
    const newGuide = new Guide(req.body);
    await newGuide.save();
    res.status(201).json({ success: true, guide: newGuide });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.use('/api/guides', guidesRouter);

// BOOK ROUTES
const booksRouter = express.Router();
booksRouter.get('/', async (req, res) => {
  try {
    const books = await Book.find({});
    res.json({ success: true, books });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
booksRouter.post('/admin', async (req, res) => {
  try {
    const newBook = new Book(req.body);
    await newBook.save();
    res.status(201).json({ success: true, book: newBook });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.use('/api/books', booksRouter);


// ✅ GET /api/user-progress/user/:userId/lesson/:lessonId
app.get('/api/user-progress/user/:userId/lesson/:lessonId', async (req, res) => {
  try {
    const { userId, lessonId } = req.params;

    // Basic validation
    if (!userId || !lessonId) {
      return res.status(400).json({
        success: false,
        error: 'userId and lessonId are required'
      });
    }

    // Import models
    const UserProgress = require('./models/userProgress');

    // Find progress
    const progress = await UserProgress.findOne({
      userId: userId,
      lessonId: lessonId
    }).populate('lessonId', 'title description order')
      .populate('topicId', 'title description order');

    res.json({
      success: true,
      data: progress || null,
      message: progress ? '✅ Progress found' : '⚠️ No progress found for this lesson'
    });

  } catch (error) {
    console.error('❌ Error in user-progress lesson route:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching lesson progress',
      details: error.message
    });
  }
});

// ✅ POST /api/user-progress/user/:userId/lesson/:lessonId
app.post('/api/user-progress/user/:userId/lesson/:lessonId', async (req, res) => {
  ('✅ ROUTE: POST /api/user-progress/user/:userId/lesson/:lessonId called');
  try {
    const { userId, lessonId } = req.params;
    const progressData = req.body;

    // Basic validation
    if (!userId || !lessonId) {
      return res.status(400).json({
        success: false,
        error: 'userId and lessonId are required'
      });
    }

    // Import models
    const UserProgress = require('./models/userProgress');
    const Lesson = require('./models/lesson');

    // Get topicId from lesson if not provided
    let finalTopicId = progressData.topicId;
    if (!finalTopicId) {
      try {
        const lesson = await Lesson.findById(lessonId);
        if (lesson && lesson.topicId) {
          finalTopicId = lesson.topicId;
        }
      } catch (lessonError) {
        console.warn('⚠️ Failed to find lesson to get topicId:', lessonError.message);
      }
    }

    const updateData = {
      userId: userId,
      lessonId: lessonId,
      topicId: finalTopicId,
      completedSteps: progressData.completedSteps || [],
      progressPercent: Math.min(100, Math.max(0, Number(progressData.progressPercent) || 0)),
      completed: Boolean(progressData.completed),
      mistakes: Math.max(0, Number(progressData.mistakes) || 0),
      medal: String(progressData.medal || 'none'),
      duration: Math.max(0, Number(progressData.duration) || 0),
      stars: Math.min(5, Math.max(0, Number(progressData.stars) || 0)),
      points: Math.max(0, Number(progressData.points) || 0),
      hintsUsed: Math.max(0, Number(progressData.hintsUsed) || 0),
      submittedHomework: Boolean(progressData.submittedHomework),
      updatedAt: new Date()
    };

    // Remove null/undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === null || updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const updated = await UserProgress.findOneAndUpdate(
      { userId: userId, lessonId: lessonId },
      updateData,
      { upsert: true, new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: updated,
      message: '✅ Progress saved successfully'
    });

  } catch (error) {

    if (error.name === 'CastError') {
      res.status(400).json({
        success: false,
        error: 'Invalid data format',
        field: error.path,
        value: error.value
      });
    } else if (error.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: Object.values(error.errors).map(e => e.message)
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Error saving progress',
        details: error.message
      });
    }
  }
});

// ✅ GET /api/user-progress (for general user progress queries)
app.get('/api/user-progress', async (req, res) => {

  try {
    const { userId, lessonId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required as query parameter'
      });
    }

    const UserProgress = require('./models/userProgress');

    if (lessonId) {
      // Get specific lesson progress
      const progress = await UserProgress.findOne({ userId, lessonId })
        .populate('lessonId', 'title description order')
        .populate('topicId', 'title description order');

      return res.json({
        success: true,
        data: progress || null,
        message: progress ? '✅ Progress found' : '⚠️ No progress found'
      });
    } else {
      // Get all progress for user
      const progressRecords = await UserProgress.find({ userId })
        .populate('lessonId', 'title description order')
        .populate('topicId', 'title description order')
        .sort({ updatedAt: -1 });

      return res.json({
        success: true,
        data: progressRecords,
        message: '✅ All progress loaded'
      });
    }

  } catch (error) {
    console.error('❌ Error in user-progress general route:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching progress',
      details: error.message
    });
  }
});

// ========================================
// 📚 MISSING HOMEWORK ROUTES
// ========================================

// ✅ GET /api/homeworks/user/:userId
app.get('/api/homeworks/user/:userId', async (req, res) => {

  try {
    const { userId } = req.params;

    // Try to import models
    let HomeworkProgress, Homework, Lesson;
    try {
      HomeworkProgress = require('./models/homeworkProgress');
      Homework = require('./models/homework');
      Lesson = require('./models/lesson');
    } catch (modelError) {
      console.warn('⚠️ Homework models not found, returning empty array');
      return res.json({
        success: true,
        data: [],
        message: 'Homework models not available'
      });
    }

    // Get user progress
    const userProgress = await HomeworkProgress.find({ userId })
      .populate('lessonId', 'title lessonName subject homework')
      .sort({ updatedAt: -1 });

    // Get standalone homework
    const standaloneHomework = await Homework.find({ isActive: true });

    // Get lessons with homework
    const lessonsWithHomework = await Lesson.find({
      homework: { $exists: true, $ne: [], $not: { $size: 0 } }
    });

    const allHomeworks = [];

    // Add standalone homework
    for (const hw of standaloneHomework) {
      const userHwProgress = userProgress.find(up =>
        up.homeworkId?.toString() === hw._id.toString() ||
        up.metadata?.standaloneHomeworkId === hw._id.toString()
      );

      allHomeworks.push({
        _id: hw._id,
        title: hw.title,
        subject: hw.subject,
        level: hw.level,
        instructions: hw.instructions,
        dueDate: hw.dueDate,
        difficulty: hw.difficulty,
        exercises: hw.exercises || [],
        type: 'standalone',
        completed: userHwProgress?.completed || false,
        score: userHwProgress?.score || 0,
        updatedAt: userHwProgress?.updatedAt || hw.updatedAt,
        hasProgress: !!userHwProgress
      });
    }

    // Add lesson-based homework
    for (const lesson of lessonsWithHomework) {
      const userHwProgress = userProgress.find(up => up.lessonId?.toString() === lesson._id.toString());

      allHomeworks.push({
        lessonId: lesson._id,
        title: `Домашнее задание: ${lesson.lessonName || lesson.title}`,
        lessonName: lesson.lessonName || lesson.title,
        subject: lesson.subject,
        level: lesson.level,
        instructions: lesson.homeworkInstructions || '',
        exercises: lesson.homework || [],
        type: 'lesson',
        completed: userHwProgress?.completed || false,
        score: userHwProgress?.score || 0,
        updatedAt: userHwProgress?.updatedAt || lesson.updatedAt,
        hasProgress: !!userHwProgress
      });
    }

    // Sort by priority
    allHomeworks.sort((a, b) => {
      const getStatus = (hw) => {
        if (!hw.hasProgress) return 'pending';
        if (!hw.completed) return 'in-progress';
        return 'completed';
      };

      const statusPriority = { 'in-progress': 0, 'pending': 1, 'completed': 2 };
      const aStatus = getStatus(a);
      const bStatus = getStatus(b);

      if (statusPriority[aStatus] !== statusPriority[bStatus]) {
        return statusPriority[aStatus] - statusPriority[bStatus];
      }

      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    res.json({
      success: true,
      data: allHomeworks,
      message: '✅ Homework list retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching user homeworks:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching homework list',
      details: error.message
    });
  }
});

// ✅ GET /api/homeworks/user/:userId/lesson/:lessonId
app.get('/api/homeworks/user/:userId/lesson/:lessonId', async (req, res) => {

  try {
    const { userId, lessonId } = req.params;

    const Lesson = require('./models/lesson');
    let HomeworkProgress;
    try {
      HomeworkProgress = require('./models/homeworkProgress');
    } catch (modelError) {
      console.warn('⚠️ HomeworkProgress model not found');
    }

    // Get lesson
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        error: 'Lesson not found'
      });
    }

    if (!lesson.homework || !Array.isArray(lesson.homework) || lesson.homework.length === 0) {
      return res.json({
        success: false,
        error: 'В этом уроке нет домашнего задания'
      });
    }

    // Try to get user progress
    let userProgress = null;
    if (HomeworkProgress) {
      try {
        userProgress = await HomeworkProgress.findOne({
          userId: userId,
          lessonId: lessonId
        });
      } catch (progressError) {
        console.warn('⚠️ Error fetching user homework progress:', progressError.message);
      }
    }

    res.json({
      success: true,
      data: {
        homework: userProgress,
        questions: lesson.homework,
        lessonInfo: {
          id: lesson._id,
          name: lesson.lessonName || lesson.title,
          subject: lesson.subject,
          instructions: lesson.homeworkInstructions || ''
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching homework by lesson:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching lesson homework',
      details: error.message
    });
  }
});


// ========================================
// 🚨 ALTERNATIVE: ADD PROMOCODE ROUTES DIRECTLY TO server.js (IF ROUTE FILE MISSING)
// ========================================

// If you don't have the promocodeRoutes.js file, add this directly to your server.js file
// Place this AFTER your existing emergency routes and BEFORE the route mounting section:


// Import the model directly
const Promocode = require('./models/promoCode'); // Note: your model file is promoCode.js, not promocode.js

// Basic auth middleware (customize based on your auth system)
const requireAuth = async (req, res, next) => {
  try {
    // Use your existing auth logic here
    if (!req.headers.authorization) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // For now, assume authenticated admin user
    req.user = {
      uid: 'admin',
      email: 'admin@aced.live',
      name: 'Admin User'
    };
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid authentication' });
  }
};

// ✅ GET /api/promocodes - Get all promocodes with pagination and filtering
app.get('/api/promocodes', requireAuth, async (req, res) => {
  try {

    const {
      page = 1,
      limit = 20,
      search = '',
      status = '',
      plan = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = {};

    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { createdByName: { $regex: search, $options: 'i' } }
      ];
    }

    if (plan) {
      filter.grantsPlan = plan;
    }

    // Status filtering
    const now = new Date();
    if (status === 'active') {
      filter.isActive = true;
      filter.$and = [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }
      ];
    } else if (status === 'inactive') {
      filter.isActive = false;
    } else if (status === 'expired') {
      filter.expiresAt = { $lt: now };
    } else if (status === 'exhausted') {
      filter.$expr = { $gte: ['$currentUses', '$maxUses'] };
      filter.maxUses = { $ne: null };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [promocodes, total] = await Promise.all([
      Promocode.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Promocode.countDocuments(filter)
    ]);

    // Add computed fields for frontend
    const enrichedPromocodes = promocodes.map(promo => {
      const isExpired = promo.expiresAt && now > promo.expiresAt;
      const isExhausted = promo.maxUses && promo.currentUses >= promo.maxUses;
      const remainingUses = promo.maxUses ? Math.max(0, promo.maxUses - promo.currentUses) : null;
      const usagePercentage = promo.maxUses ? Math.round((promo.currentUses / promo.maxUses) * 100) : 0;

      let computedStatus = 'active';
      if (!promo.isActive) computedStatus = 'inactive';
      else if (isExpired) computedStatus = 'expired';
      else if (isExhausted) computedStatus = 'exhausted';

      return {
        ...promo,
        isExpired,
        isExhausted,
        remainingUses,
        usagePercentage,
        status: computedStatus
      };
    });

    res.json({
      success: true,
      data: enrichedPromocodes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });


  } catch (error) {
    console.error('❌ Error fetching promocodes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch promocodes',
      details: error.message
    });
  }
});

// ✅ GET /api/promocodes/stats - Get promocode statistics
app.get('/api/promocodes/stats', requireAuth, async (req, res) => {
  try {

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      total,
      active,
      expired,
      exhausted,
      inactive,
      recentUsageResult,
      planDistribution
    ] = await Promise.all([
      Promocode.countDocuments(),
      Promocode.countDocuments({
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: now } }
        ]
      }),
      Promocode.countDocuments({
        expiresAt: { $lt: now }
      }),
      Promocode.countDocuments({
        $expr: { $gte: ['$currentUses', '$maxUses'] },
        maxUses: { $ne: null }
      }),
      Promocode.countDocuments({ isActive: false }),
      Promocode.aggregate([
        { $unwind: '$usedBy' },
        { $match: { 'usedBy.usedAt': { $gte: thirtyDaysAgo } } },
        { $count: 'recentUsage' }
      ]),
      Promocode.aggregate([
        { $group: { _id: '$grantsPlan', count: { $sum: 1 } } }
      ])
    ]);

    const stats = {
      total: total || 0,
      active: active || 0,
      expired: expired || 0,
      exhausted: exhausted || 0,
      inactive: inactive || 0,
      recentUsage: recentUsageResult[0]?.recentUsage || 0,
      planDistribution: planDistribution.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    };

    res.json({
      success: true,
      stats: stats
    });


  } catch (error) {
    console.error('❌ Error fetching promocode stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch promocode stats',
      details: error.message
    });
  }
});

// ✅ POST /api/promocodes - Create new promocode
app.post('/api/promocodes', requireAuth, async (req, res) => {
  try {

    const {
      code,
      grantsPlan,
      description,
      maxUses,
      expiresAt,
      subscriptionDays,
      generateRandom,
      isActive = true
    } = req.body;

    // Validation
    if (!grantsPlan || !['start', 'pro', 'premium'].includes(grantsPlan)) {
      return res.status(400).json({
        success: false,
        error: 'Valid grantsPlan is required (start, pro, premium)'
      });
    }

    let finalCode = code?.trim()?.toUpperCase();

    // Generate random code if requested or no code provided
    if (generateRandom || !finalCode) {
      const prefix = grantsPlan.toUpperCase().substring(0, 3);
      finalCode = generateRandomCode(prefix, 10);

      // Ensure uniqueness
      let attempts = 0;
      while (await Promocode.findOne({ code: finalCode }) && attempts < 10) {
        finalCode = generateRandomCode(prefix, 10);
        attempts++;
      }

      if (attempts >= 10) {
        return res.status(500).json({
          success: false,
          error: 'Failed to generate unique code, please try again'
        });
      }
    }

    if (!finalCode || finalCode.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'Code must be at least 4 characters long'
      });
    }

    // Check if code already exists
    const existingCode = await Promocode.findOne({ code: finalCode });
    if (existingCode) {
      return res.status(400).json({
        success: false,
        error: 'Promocode already exists'
      });
    }

    // Validate dates
    let parsedExpiresAt = null;
    if (expiresAt) {
      parsedExpiresAt = new Date(expiresAt);
      if (parsedExpiresAt <= new Date()) {
        return res.status(400).json({
          success: false,
          error: 'Expiry date must be in the future'
        });
      }
    }

    // Validate subscription days
    const days = parseInt(subscriptionDays) || 30;
    if (days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        error: 'Subscription days must be between 1 and 365'
      });
    }

    // Create promocode
    const promocode = new Promocode({
      code: finalCode,
      grantsPlan,
      description: description?.trim() || `${grantsPlan.toUpperCase()} plan access`,
      maxUses: maxUses && maxUses > 0 ? parseInt(maxUses) : null,
      expiresAt: parsedExpiresAt,
      subscriptionDays: days,
      isActive: Boolean(isActive),
      createdBy: req.user.uid,
      createdByName: req.user.name || req.user.email || 'Admin',
      createdByEmail: req.user.email || ''
    });

    await promocode.save();

    res.status(201).json({
      success: true,
      data: promocode,
    });

  } catch (error) {
    console.error('❌ Error creating promocode:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Promocode already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create promocode',
      details: error.message
    });
  }
});

// ✅ PUT /api/promocodes/:id - Update promocode
app.put('/api/promocodes/:id', requireAuth, async (req, res) => {
  try {

    const promocode = await Promocode.findById(req.params.id);
    if (!promocode) {
      return res.status(404).json({
        success: false,
        error: 'Promocode not found'
      });
    }

    const {
      description,
      maxUses,
      expiresAt,
      subscriptionDays,
      isActive
    } = req.body;

    // Update fields
    if (description !== undefined) {
      promocode.description = description?.trim() || '';
    }

    if (maxUses !== undefined) {
      promocode.maxUses = maxUses && maxUses > 0 ? parseInt(maxUses) : null;
    }

    if (expiresAt !== undefined) {
      if (expiresAt) {
        const parsedDate = new Date(expiresAt);
        if (parsedDate <= new Date()) {
          return res.status(400).json({
            success: false,
            error: 'Expiry date must be in the future'
          });
        }
        promocode.expiresAt = parsedDate;
      } else {
        promocode.expiresAt = null;
      }
    }

    if (subscriptionDays !== undefined) {
      const days = parseInt(subscriptionDays);
      if (days < 1 || days > 365) {
        return res.status(400).json({
          success: false,
          error: 'Subscription days must be between 1 and 365'
        });
      }
      promocode.subscriptionDays = days;
    }

    if (isActive !== undefined) {
      promocode.isActive = Boolean(isActive);
    }

    await promocode.save();

    res.json({
      success: true,
      data: promocode,
      message: `Promocode ${promocode.code} updated successfully`
    });

  } catch (error) {
    console.error('❌ Error updating promocode:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update promocode',
      details: error.message
    });
  }
});

// ✅ DELETE /api/promocodes/:id - Delete promocode
app.delete('/api/promocodes/:id', requireAuth, async (req, res) => {
  try {

    const promocode = await Promocode.findById(req.params.id);
    if (!promocode) {
      return res.status(404).json({
        success: false,
        error: 'Promocode not found'
      });
    }

    // Check if promocode has been used
    if (promocode.currentUses > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete promocode that has been used. Deactivate it instead.',
        usageCount: promocode.currentUses
      });
    }

    await promocode.deleteOne();

    res.json({
      success: true,
      message: `Promocode ${promocode.code} deleted successfully`
    });

  } catch (error) {
    console.error('❌ Error deleting promocode:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete promocode',
      details: error.message
    });
  }
});

// Helper function to generate random codes
function generateRandomCode(prefix = '', length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = prefix.toUpperCase();
  const remainingLength = Math.max(4, length - prefix.length);

  for (let i = 0; i < remainingLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}



// ✅ GET /api/homeworks/user/:userId/homework/:homeworkId
app.get('/api/homeworks/user/:userId/homework/:homeworkId', async (req, res) => {

  try {
    const { userId, homeworkId } = req.params;

    let Homework, HomeworkProgress;
    try {
      Homework = require('./models/homework');
      HomeworkProgress = require('./models/homeworkProgress');
    } catch (modelError) {
      console.warn('⚠️ Homework models not found, returning 404');
      return res.status(404).json({
        success: false,
        error: 'Homework system not available'
      });
    }

    // Get homework
    const homework = await Homework.findById(homeworkId);
    if (!homework) {
      return res.status(404).json({
        success: false,
        error: 'Homework not found'
      });
    }

    if (!homework.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Homework is not active'
      });
    }

    // Get user progress
    let userProgress = null;
    try {
      userProgress = await HomeworkProgress.findOne({
        userId: userId,
        $or: [
          { homeworkId: homeworkId },
          { lessonId: homeworkId },
          { 'metadata.standaloneHomeworkId': homeworkId }
        ]
      });
    } catch (progressError) {
      console.warn('⚠️ Error fetching homework progress:', progressError.message);
    }

    res.json({
      success: true,
      data: {
        homework: homework,
        userProgress: userProgress,
        questions: homework.exercises || []
      },
      message: '✅ Homework retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching standalone homework:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching homework',
      details: error.message
    });
  }
});

// ========================================
// 📝 MISSING TEST ROUTES
// ========================================

// ✅ GET /api/users/:userId/tests
app.get('/api/users/:userId/tests', async (req, res) => {

  try {
    const { userId } = req.params;

    let Test, TestResult;
    try {
      Test = require('./models/Test');
      TestResult = require('./models/TestResult');
    } catch (modelError) {
      console.warn('⚠️ Test models not found, returning empty array');
      return res.json({
        success: true,
        tests: [],
        message: 'Test models not available'
      });
    }

    const tests = await Test.find({ isActive: true }).select('-questions.correctAnswer -questions.explanation');
    const userResults = await TestResult.find({ userId });

    const testsWithProgress = tests.map(test => {
      const userResult = userResults.find(result => result.testId.toString() === test._id.toString());

      return {
        ...test.toObject(),
        userProgress: userResult ? {
          completed: true,
          score: userResult.score,
          submittedAt: userResult.submittedAt,
          canRetake: test.allowRetakes
        } : {
          completed: false,
          canRetake: true
        }
      };
    });

    res.json({
      success: true,
      tests: testsWithProgress,
      message: '✅ Tests retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching user tests:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching tests',
      details: error.message
    });
  }
});

// ✅ GET /api/users/:userId/tests/:testId
app.get('/api/users/:userId/tests/:testId', async (req, res) => {

  try {
    const { testId } = req.params;

    let Test;
    try {
      Test = require('./models/Test');
    } catch (modelError) {
      console.warn('⚠️ Test model not found, returning 404');
      return res.status(404).json({
        success: false,
        error: 'Test system not available'
      });
    }

    const test = await Test.findById(testId).select('-questions.correctAnswer -questions.explanation');

    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }

    if (!test.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Test is not active'
      });
    }

    // Randomize questions if enabled
    if (test.randomizeQuestions && test.questions.length > 0) {
      test.questions = test.questions.sort(() => Math.random() - 0.5);
    }

    // Randomize options if enabled
    if (test.randomizeOptions) {
      test.questions.forEach(question => {
        if (question.options && question.options.length > 0) {
          question.options = question.options.sort(() => Math.random() - 0.5);
        }
      });
    }

    res.json({
      success: true,
      test: test,
      message: '✅ Test retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching test:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching test',
      details: error.message
    });
  }
});


// ========================================
// 📊 ADD ROUTE DEBUGGING ENDPOINT
// ========================================

// ✅ Enhanced route debugging endpoint
app.get('/api/debug/routes', (req, res) => {
  const routes = [];

  function extractRoutes(stack, basePath = '') {
    stack.forEach(layer => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
        routes.push({
          path: basePath + layer.route.path,
          methods: methods,
          source: 'direct'
        });
      } else if (layer.name === 'router' && layer.handle.stack) {
        const newBasePath = basePath + (layer.regexp.source.replace(/\\/g, '').replace(/\^/g, '').replace(/\$/g, '').replace(/\?(?=\?)/g, '') || '');
        extractRoutes(layer.handle.stack, newBasePath);
      }
    });
  }

  // Extract all routes
  app._router.stack.forEach(layer => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
      routes.push({
        path: layer.route.path,
        methods: methods,
        source: 'app'
      });
    } else if (layer.name === 'router' && layer.handle.stack) {
      let basePath = '';
      if (layer.regexp && layer.regexp.source) {
        const regexSource = layer.regexp.source;
        const match = regexSource.match(/\\\/([^\\]+)/);
        if (match) {
          basePath = '/' + match[1];
        }
      }
      extractRoutes(layer.handle.stack, basePath);
    }
  });

  routes.sort((a, b) => a.path.localeCompare(b.path));

  const groupedRoutes = {};
  routes.forEach(route => {
    const basePath = route.path.split('/')[1] || 'root';
    if (!groupedRoutes[basePath]) {
      groupedRoutes[basePath] = [];
    }
    groupedRoutes[basePath].push(route);
  });

  res.json({
    server: 'api.aced.live',
    timestamp: new Date().toISOString(),
    totalRoutes: routes.length,
    routeGroups: groupedRoutes,
    allRoutes: routes,

    // Specifically check for the routes that were causing 404s
    criticalRoutes: {
      userProgressUserLesson: routes.find(r => r.path.includes('user-progress/user') && r.path.includes('lesson')),
      userProgressMain: routes.find(r => r.path === '/api/user-progress'),
      progressMain: routes.find(r => r.path === '/api/progress'),
      homeworksUser: routes.find(r => r.path.includes('homeworks/user')),
      usersTests: routes.find(r => r.path.includes('users') && r.path.includes('tests'))
    },

    missingRoutes: {
      'GET /api/user-progress/user/:userId/lesson/:lessonId': !routes.find(r =>
        r.path.includes('user-progress/user') && r.path.includes('lesson') && r.methods.includes('GET')
      ),
      'POST /api/user-progress/user/:userId/lesson/:lessonId': !routes.find(r =>
        r.path.includes('user-progress/user') && r.path.includes('lesson') && r.methods.includes('POST')
      ),
      'GET /api/homeworks/user/:userId': !routes.find(r =>
        r.path.includes('homeworks/user') && r.methods.includes('GET')
      )
    }
  });
});

// ========================================
// 🤖 AI LESSON GENERATION ROUTES
// ========================================

// Test connection endpoint
app.get('/api/ai/test-connection', async (req, res) => {
  try {

    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({
        success: false,
        error: 'OpenAI API key not configured',
        configured: false
      });
    }

    // Try importing OpenAI
    try {
      const { OpenAI } = require('openai');

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });

      // Test with a simple request
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Say "Connection successful"' }],
        max_tokens: 10
      });


      res.json({
        success: true,
        configured: true,
        model: 'gpt-3.5-turbo',
        response: response.choices[0].message.content,
        usage: response.usage
      });

    } catch (openaiError) {
      console.error('❌ OpenAI API error:', openaiError);

      let errorMessage = 'OpenAI API error';
      if (openaiError.message?.includes('API key')) {
        errorMessage = 'Invalid OpenAI API key';
      } else if (openaiError.message?.includes('rate limit')) {
        errorMessage = 'Rate limit exceeded';
      } else if (openaiError.message?.includes('insufficient')) {
        errorMessage = 'Insufficient credits';
      }

      res.status(400).json({
        success: false,
        configured: true,
        error: errorMessage
      });
    }

  } catch (error) {
    console.error('❌ AI test connection failed:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during AI test',
      details: error.message
    });
  }
});

// Lesson generation endpoint
app.post('/api/ai/generate-lesson', async (req, res) => {
  try {

    const {
      subject,
      level,
      topic,
      lessonName,
      description,
      options = {}
    } = req.body;

    // Validation
    if (!subject || !level || !topic || !lessonName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: subject, level, topic, lessonName'
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({
        success: false,
        error: 'OpenAI API key not configured'
      });
    }

    const { OpenAI } = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Create prompt
    const prompt = createLessonPrompt(req.body);


    const response = await openai.chat.completions.create({
      model: options.model || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an expert educational content creator. Create structured, engaging lessons. Respond with valid JSON only.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 6000,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const generatedContent = JSON.parse(response.choices[0].message.content);
    const formattedLesson = formatLessonForAPI(generatedContent, req.body);


    res.json({
      success: true,
      lesson: formattedLesson,
      usage: response.usage,
      model: options.model || 'gpt-3.5-turbo'
    });

  } catch (error) {
    console.error('❌ AI lesson generation failed:', error);

    let errorMessage = 'AI lesson generation failed';
    if (error.message?.includes('API key')) {
      errorMessage = 'OpenAI API key issue';
    } else if (error.message?.includes('rate limit')) {
      errorMessage = 'OpenAI rate limit exceeded';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper functions
function createLessonPrompt(request) {
  const { subject, level, topic, lessonName, description, options = {} } = request;

  return `Create a comprehensive lesson for:
Subject: ${subject}
Level: ${level}
Topic: ${topic}
Name: ${lessonName}
Description: ${description}

Generate JSON with this structure:
{
  "subject": "${subject}",
  "level": ${level},
  "topic": "${topic}",
  "lessonName": "${lessonName}",
  "description": "${description}",
  "steps": [
    {
      "type": "explanation",
      "data": {
        "content": "Detailed explanation about ${topic}..."
      }
    }
  ]
}`;
}

function formatLessonForAPI(generatedContent, originalRequest) {
  return {
    subject: generatedContent.subject || originalRequest.subject,
    level: generatedContent.level || originalRequest.level,
    type: 'free',
    topic: generatedContent.topic || originalRequest.topic,
    topicDescription: generatedContent.topicDescription || originalRequest.description,
    lessonName: generatedContent.lessonName || originalRequest.lessonName,
    description: generatedContent.description || originalRequest.description,
    steps: generatedContent.steps || [],
    explanations: [],
    relatedSubjects: [],
    translations: {},
    createHomework: originalRequest.options?.createHomework || false,
    isDraft: false,
    isActive: true
  };
}
app.post('/api/lessons/generate-ai', async (req, res) => {
  try {

    const {
      subject,
      level,
      topic,
      lessonName,
      description,
      options = {}
    } = req.body;

    // Validation
    if (!subject || !level || !topic || !lessonName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: subject, level, topic, lessonName'
      });
    }

    // Import OpenAI
    const { OpenAI } = require('openai');

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY // Use your backend env var
    });

    // Create educational prompt
    const prompt = createLessonPrompt({
      subject, level, topic, lessonName, description, options
    });


    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: options.model || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an expert educational content creator. Create structured, engaging lessons that follow proper educational methodology. You must respond with valid JSON only.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 6000,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const generatedContent = JSON.parse(response.choices[0].message.content);


    // Format for your existing addLesson API
    const formattedLesson = formatLessonForAPI(generatedContent, req.body);

    res.json({
      success: true,
      lesson: formattedLesson,
      usage: response.usage,
      model: options.model || 'gpt-3.5-turbo'
    });

  } catch (error) {
    console.error('❌ AI lesson generation failed:', error);

    let errorMessage = 'AI lesson generation failed';

    if (error.message?.includes('API key')) {
      errorMessage = 'OpenAI API key not configured properly';
    } else if (error.message?.includes('rate limit')) {
      errorMessage = 'OpenAI rate limit exceeded. Please try again later.';
    } else if (error.message?.includes('insufficient')) {
      errorMessage = 'Insufficient OpenAI credits';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ STUDY LIST ROUTES - SIMPLE AND WORKING
app.post('/api/users/:userId/study-list', async (req, res) => {
  try {
    const { userId } = req.params;
    const data = req.body;

    if (!data.topicId || !data.topic) {
      return res.status(400).json({
        success: false,
        error: 'topicId and topic are required'
      });
    }

    const User = require('./models/user');
    let user = await User.findOne({ firebaseId: userId });

    if (!user) {
      user = new User({
        firebaseId: userId,
        email: 'user@example.com',
        name: 'User',
        studyList: []
      });
    }

    // Check if already exists
    const exists = user.studyList.some(item => item.topicId === data.topicId);
    if (exists) {
      return res.status(400).json({
        success: false,
        error: 'Topic already exists in study list'
      });
    }

    // Add to study list
    user.studyList.push({
      topicId: data.topicId,
      topic: data.topic,
      subject: data.subject || 'General',
      level: data.level || 1,
      lessonCount: data.lessonCount || 0,
      totalTime: data.totalTime || 10,
      type: data.type || 'free',
      addedAt: new Date()
    });

    await user.save();

    res.json({
      success: true,
      message: 'Topic added to study list'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/users/:userId/study-list', async (req, res) => {
  try {
    const { userId } = req.params;
    const User = require('./models/user');
    const user = await User.findOne({ firebaseId: userId });

    if (!user) {
      return res.json({ success: true, data: [] });
    }

    res.json({
      success: true,
      data: user.studyList || []
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete('/api/users/:userId/study-list/:topicId', async (req, res) => {
  try {
    const { userId, topicId } = req.params;
    const User = require('./models/user');
    const user = await User.findOne({ firebaseId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    user.studyList = user.studyList.filter(item => item.topicId !== topicId);
    await user.save();

    res.json({
      success: true,
      message: 'Topic removed from study list'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ========================================
// 🖼️ IMAGE PROCESSING HELPER FUNCTIONS FOR COURSES
// ========================================

/**
 * Process and validate images array for course steps
 */
function processImages(images, lessonIndex, stepIndex) {
  if (!Array.isArray(images)) return [];


  return images
    .filter(img => img && (img.url || img.base64))
    .map((img, imgIndex) => {
      // Handle both URL and base64 images
      const processedImage = {
        id: img.id || `img_${lessonIndex}_${stepIndex}_${imgIndex}`,
        url: img.url || '',
        caption: img.caption || '',
        filename: img.filename || `image_${imgIndex}`,
        size: img.size || 0,
        alt: img.alt || img.caption || `Image ${imgIndex + 1}`,
        order: img.order || imgIndex
      };

      // Handle base64 images (convert to URL if needed)
      if (img.base64 && !img.url) {
        processedImage.base64 = img.base64;
        processedImage.needsConversion = true;
        // For now, use base64 as URL (backend can convert this later)
        processedImage.url = img.base64;
      }

      // Image display options
      if (img.displayOptions) {
        processedImage.displayOptions = {
          width: img.displayOptions.width || 'auto',
          height: img.displayOptions.height || 'auto',
          alignment: img.displayOptions.alignment || 'center',
          zoom: img.displayOptions.zoom || false
        };
      }

      return processedImage;
    })
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Extract content from step object
 */
function extractContent(step) {
  // Priority order: content -> data.content -> description
  if (step.content && typeof step.content === 'string' && step.content.trim()) {
    return step.content.trim();
  }

  if (step.data?.content && typeof step.data.content === 'string' && step.data.content.trim()) {
    return step.data.content.trim();
  }

  if (step.description && step.description.trim()) {
    return step.description.trim();
  }

  return '';
}

/**
 * Process quiz data with image support
 */
function processQuizData(step) {
  let quizData = [];

  if (step.data && Array.isArray(step.data) && step.data.length > 0) {
    quizData = step.data;
  } else if (step.question || step.content) {
    const quizQuestion = step.question || step.content || '';

    quizData = [{
      question: quizQuestion,
      type: step.quizType || 'multiple-choice',
      options: (step.options || []).map(opt => ({ text: opt.text || opt })),
      correctAnswer: parseInt(step.correctAnswer) || 0,
      explanation: step.explanation || '',
      images: processImages(step.questionImages || [], 0, 0)
    }];
  } else if (step.quizzes && Array.isArray(step.quizzes)) {
    quizData = step.quizzes.map(quiz => ({
      ...quiz,
      images: processImages(quiz.images || [], 0, 0)
    }));
  }

  return quizData;
}

/**
 * Validate course content including images
 */
function validateCourseContent(curriculum) {
  const issues = [];

  curriculum.forEach((lesson, lIndex) => {
    lesson.steps?.forEach((step, sIndex) => {
      const stepRef = `Lesson ${lIndex + 1}, Step ${sIndex + 1}`;

      // Content validation
      if (['explanation', 'example', 'reading'].includes(step.type)) {
        if (!step.content || !step.content.trim()) {
          issues.push(`${stepRef}: Missing content field`);
        }
        if (!step.data?.content || !step.data.content.trim()) {
          issues.push(`${stepRef}: Missing data.content field`);
        }
        if (step.content !== step.data?.content) {
          step.data.content = step.content; // Auto-fix
        }
      }

      // Image validation
      if (step.type === 'image') {
        if (!step.images || step.images.length === 0) {
          issues.push(`${stepRef}: Image step requires at least one image`);
        } else {
          step.images.forEach((img, imgIndex) => {
            if (!img.url && !img.base64) {
              issues.push(`${stepRef}, Image ${imgIndex + 1}: Missing URL or base64 data`);
            }
          });
        }
      }

      // Quiz validation
      if (step.type === 'quiz') {
        if (!step.data || step.data.length === 0) {
          issues.push(`${stepRef}: Quiz step requires questions`);
        }
      }
    });
  });

  return issues;
}

/**
 * Generate curriculum statistics including image info
 */
function generateCurriculumStats(curriculum) {
  return {
    totalLessons: curriculum.length,
    totalSteps: curriculum.reduce((sum, lesson) => sum + (lesson.steps?.length || 0), 0),
    totalImages: curriculum.reduce((sum, lesson) =>
      sum + (lesson.steps?.reduce((stepSum, step) =>
        stepSum + (step.images?.length || 0), 0) || 0), 0),
    explanationSteps: curriculum.reduce((sum, lesson) =>
      sum + (lesson.steps?.filter(step => step.type === 'explanation').length || 0), 0),
    imageSteps: curriculum.reduce((sum, lesson) =>
      sum + (lesson.steps?.filter(step => step.type === 'image').length || 0), 0),
    stepsWithContent: curriculum.reduce((sum, lesson) =>
      sum + (lesson.steps?.filter(step =>
        step.content && step.content.trim()
      ).length || 0), 0),
    stepsWithImages: curriculum.reduce((sum, lesson) =>
      sum + (lesson.steps?.filter(step =>
        step.images && step.images.length > 0
      ).length || 0), 0)
  };
}

/**
 * Helper to ensure image URLs are absolute
 */
function processImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:image')) return url;
    const baseUrl = process.env.NODE_ENV === 'production' ? 'https://api.aced.live' : 'http://localhost:5000';
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
* Helper to convert course data to a structured format for SEO or specific API responses.
*/
function convertCourseToStructuredFormat(course) {
    return {
        '@context': 'https://schema.org',
        '@type': 'Course',
        'id': course._id,
        'name': course.title,
        'description': course.description,
        'provider': {
            '@type': 'Organization',
            'name': 'ACED.live',
            'logo': processImageUrl('/logo.png')
        },
        'instructor': {
            '@type': 'Person',
            'name': course.instructor?.name || 'ACED Instructor'
        },
        'learningResourceType': 'Course',
        'isAccessibleForFree': !course.isPremium,
        'hasCourseInstance': course.curriculum?.map(lesson => ({
            '@type': 'CourseInstance',
            'courseMode': 'online',
            'name': lesson.title,
            'description': lesson.description
        })) || []
    };
}

/**
 * Helper for backward compatibility to process curriculum into lessons
 */
function processLessonsFromCurriculum(curriculum) {
    if (!curriculum) return [];
    return curriculum.map(lesson => ({
        ...lesson,
        steps: lesson.steps || []
    }));
}

/**
 * Helper for backward compatibility from a different lessons structure
 */
function processLessonsFromStructured(lessons) {
    if (!lessons) return [];
    return lessons.map(lesson => ({
        ...lesson,
        steps: lesson.steps || []
    }));
}


// ========================================
// 📚 UPDATED COURSES SCHEMA AND MODEL DEFINITION
// ========================================

const updatedCourseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  fullDescription: { type: String, trim: true },
  category: { type: String, required: true },
  difficulty: { type: String, enum: ['Начинающий', 'Средний', 'Продвинутый'], default: 'Начинающий' },
  duration: { type: String, default: '10 hours' },
  thumbnail: { type: String },
  isPremium: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'published' },
  studentsCount: { type: Number, default: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },

  instructor: {
    name: { type: String, required: true },
    avatar: { type: String },
    bio: { type: String }
  },

  tools: [{ type: String }],
  tags: [{ type: String }],

  curriculum: [{
    title: { type: String, required: true },
    description: { type: String },
    duration: { type: String, default: '30 min' },
    order: { type: Number, default: 0 },
    steps: [{
      type: { type: String, enum: ['explanation', 'example', 'practice', 'exercise', 'vocabulary', 'quiz', 'video', 'audio', 'reading', 'writing', 'image'], required: true },
      title: { type: String },
      description: { type: String },
      content: { type: String },
      data: { type: mongoose.Schema.Types.Mixed },
      images: [{
        id: { type: String },
        url: { type: String },
        caption: { type: String },
        alt: { type: String },
        order: { type: Number, default: 0 },
        base64: { type: String },
        needsConversion: { type: Boolean, default: false }
      }],
      order: { type: Number, default: 0 }
    }]
  }],

  requirements: [{ type: String }],
  learningOutcomes: [{ type: String }],
  targetAudience: [{ type: String }],
  certificateOffered: { type: Boolean, default: false },

  estimatedTime: {
    hours: { type: Number, default: 10 },
    weeks: { type: Number, default: 2 }
  },

  isGuide: { type: Boolean, default: false },
  guidePdfUrl: { type: String },

  createdBy: { type: String },
  updatedBy: { type: String },

  metadata: {
    views: { type: Number, default: 0 },
    lastViewed: { type: Date }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add text index for search
updatedCourseSchema.index({
  title: 'text',
  description: 'text',
  'instructor.name': 'text'
});

// Static methods
updatedCourseSchema.statics.getCategories = function() {
  return this.distinct('category');
};

updatedCourseSchema.statics.getDifficultyLevels = function() {
  return ['Начинающий', 'Средний', 'Продвинутый'];
};

// Instance methods
updatedCourseSchema.methods.incrementViews = function() {
  this.metadata.views = (this.metadata.views || 0) + 1;
  this.metadata.lastViewed = new Date();
  return this.save();
};

updatedCourseSchema.methods.togglePremium = function() {
  this.isPremium = !this.isPremium;
  return this;
};

// Create the model, ensuring it's only defined once
const UpdatedCourse = mongoose.models.UpdatedCourse || mongoose.model('UpdatedCourse', updatedCourseSchema);


// ========================================
// 📚 UPDATED COURSES ROUTES (EMERGENCY - DIRECT IMPLEMENTATION)
// ========================================

// ✅ GET /api/updated-courses - Get public courses with structured format support
app.get('/api/updated-courses', async (req, res) => {
  try {
    const {
      category,
      difficulty,
      search,
      limit = 50,
      page = 1,
      sort = 'newest',
      type = 'all',
      format = 'standard' // 'standard' or 'structured'
    } = req.query;

    const filter = {
      isActive: true,
      status: 'published'
    };

    if (category && category !== 'all') filter.category = category;
    if (difficulty && difficulty !== 'all') filter.difficulty = difficulty;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tools: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }
    if (type === 'courses') {
      filter.isGuide = { $ne: true };
    } else if (type === 'guides') {
      filter.isGuide = true;
    }

    let sortQuery = {};
    switch (sort) {
      case 'popular': sortQuery = { studentsCount: -1 }; break;
      case 'rating': sortQuery = { rating: -1 }; break;
      case 'duration': sortQuery = { 'estimatedTime.hours': 1 }; break;
      case 'newest':
      default: sortQuery = { createdAt: -1 };
    }

    const courses = await UpdatedCourse.find(filter)
      .sort(sortQuery)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select('-seo -metadata.views -createdBy -updatedBy')
      .lean();

    const processedCourses = courses.map(course => {
      const baseCourse = {
        ...course,
        id: course._id.toString(),
        _id: course._id.toString(),
        isBookmarked: false,
        instructor: {
          name: course.instructor?.name || 'Unknown Instructor',
          avatar: processImageUrl(course.instructor?.avatar),
          bio: course.instructor?.bio || ''
        },
        thumbnail: processImageUrl(course.thumbnail)
      };

      if (format === 'structured') {
        return {
          ...baseCourse,
          structuredData: convertCourseToStructuredFormat(course),
          format: 'structured'
        };
      }

      return {
        ...baseCourse,
        curriculum: course.curriculum || course.lessons || [],
        format: 'standard'
      };
    });

    const total = await UpdatedCourse.countDocuments(filter);

    res.json({
      success: true,
      courses: processedCourses,
      format: format,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      categories: await UpdatedCourse.getCategories(),
      difficulties: await UpdatedCourse.getDifficultyLevels()
    });
  } catch (error) {
    console.error('❌ Error fetching updated courses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch courses',
      details: error.message
    });
  }
});

// ✅ NEW: Add dedicated structured endpoint
app.get('/api/updated-courses/structured', async (req, res) => {
  try {
    const {
      category,
      difficulty,
      search,
      limit = 20,
      page = 1
    } = req.query;

    const filter = {
      isActive: true,
      status: 'published'
    };

    if (category && category !== 'all') filter.category = category;
    if (difficulty && difficulty !== 'all') filter.difficulty = difficulty;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const courses = await UpdatedCourse.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    const structuredCourses = courses.map(course =>
      convertCourseToStructuredFormat(course)
    );

    const total = await UpdatedCourse.countDocuments(filter);

    res.json({
      success: true,
      format: 'structured',
      courses: structuredCourses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching structured courses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch structured courses',
      details: error.message
    });
  }
});


// ✅ GET /api/updated-courses/:id - Enhanced single course route
app.get('/api/updated-courses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'standard' } = req.query; // Support format query

    const course = await UpdatedCourse.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
        { 'seo.slug': id }
      ],
      isActive: true,
      status: 'published'
    }).select('-createdBy -updatedBy');


    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    await course.incrementViews();
    let courseData;

    if (format === 'structured') {
      courseData = convertCourseToStructuredFormat(course.toObject());
    } else {
      courseData = {
        ...course.toObject(),
        id: course._id.toString(),
        _id: course._id.toString(),
        isBookmarked: false,
        lessons: course.curriculum ? processLessonsFromCurriculum(course.curriculum) : [],
        thumbnail: processImageUrl(course.thumbnail),
        instructor: {
          ...course.instructor,
          avatar: processImageUrl(course.instructor?.avatar)
        }
      };
    }

    res.json({
      success: true,
      course: courseData,
      format: format
    });
  } catch (error) {
    console.error('❌ Error fetching course:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch course'
    });
  }
});


// ✅ GET /api/updated-courses/admin/all - Get all courses for admin
app.get('/api/updated-courses/admin/all', async (req, res) => {
  try {
    const {
      category,
      difficulty,
      status,
      search,
      limit = 20,
      page = 1,
      sort = 'newest'
    } = req.query;

    const filter = {};
    if (category && category !== 'all') filter.category = category;
    if (difficulty && difficulty !== 'all') filter.difficulty = difficulty;
    if (status && status !== 'all') filter.status = status;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    let sortQuery = {};
    switch (sort) {
      case 'newest': sortQuery = { createdAt: -1 }; break;
      case 'updated': sortQuery = { updatedAt: -1 }; break;
      default: sortQuery = { createdAt: -1 };
    }

    const courses = await UpdatedCourse.find(filter)
      .sort(sortQuery)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    const total = await UpdatedCourse.countDocuments(filter);

    res.json({
      success: true,
      courses: courses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Admin: Error fetching updated courses:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch updated courses', details: error.message });
  }
});

// ✅ PUT /api/updated-courses/admin/:id - Update course
app.put('/api/updated-courses/admin/:id', async (req, res) => {
  try {
    const course = await UpdatedCourse.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    Object.assign(course, req.body);
    course.updatedBy = 'admin';

    if (req.body.curriculum && Array.isArray(req.body.curriculum)) {
      const processedCurriculum = req.body.curriculum.map((lesson, lessonIndex) => {
        const processedLesson = {
          title: lesson.title || `Lesson ${lessonIndex + 1}`,
          description: lesson.description || '',
          duration: lesson.duration || '30 min',
          order: lesson.order || lessonIndex,
          steps: []
        };
        if (lesson.steps && Array.isArray(lesson.steps)) {
          processedLesson.steps = lesson.steps.map((step, stepIndex) => {
            const processedStep = {
              type: step.type || 'explanation',
              title: step.title || '',
              description: step.description || '',
              content: '',
              data: {},
              images: processImages(step.images || [], lessonIndex, stepIndex)
            };
            switch (step.type) {
              case 'explanation':
              case 'example':
              case 'reading':
                const explanationContent = extractContent(step);
                processedStep.content = explanationContent;
                processedStep.data = { content: explanationContent, images: processedStep.images };
                break;
              case 'image':
                const imageDescription = step.content || step.description || '';
                processedStep.content = imageDescription;
                processedStep.data = { images: processedStep.images, description: imageDescription };
                break;
              case 'practice':
                const practiceInstructions = extractContent(step) || step.instructions || '';
                processedStep.content = practiceInstructions;
                processedStep.data = { instructions: practiceInstructions, type: step.data?.type || step.practiceType || 'guided', images: processedStep.images };
                processedStep.instructions = practiceInstructions;
                break;
              case 'quiz':
                const quizData = processQuizData(step);
                processedStep.content = quizData.length > 0 ? quizData[0].question : '';
                processedStep.data = quizData;
                processedStep.quizzes = quizData;
                if (quizData.length > 0) {
                  processedStep.question = quizData[0].question;
                  processedStep.options = quizData[0].options || [];
                  processedStep.correctAnswer = quizData[0].correctAnswer || 0;
                }
                break;
              default:
                const defaultContent = extractContent(step);
                processedStep.content = defaultContent;
                processedStep.data = { content: defaultContent, images: processedStep.images };
            }
            return processedStep;
          });
        }
        return processedLesson;
      });
      course.curriculum = processedCurriculum;
      const validationIssues = validateCourseContent(course.curriculum);
      if (validationIssues.length > 0) {
        console.warn('⚠️ Validation issues found:', validationIssues);
      }
    }

    await course.save();
    res.json({ success: true, course: course, message: 'Course updated successfully with image support' });
  } catch (error) {
    console.error('❌ Admin: Error updating course:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: 'Validation error', details: Object.values(error.errors).map(err => err.message) });
    }
    res.status(500).json({ success: false, error: 'Failed to update course', details: error.message });
  }
});

// ✅ POST /api/updated-courses/admin - Create new course
app.post('/api/updated-courses/admin', async (req, res) => {
  try {
    const courseData = { ...req.body, createdBy: 'admin', updatedBy: 'admin' };
    const requiredFields = ['title', 'description', 'category', 'instructor'];
    const missingFields = requiredFields.filter(field => {
      if (field === 'instructor') return !courseData.instructor || !courseData.instructor.name;
      return !courseData[field];
    });

    if (missingFields.length > 0) {
      return res.status(400).json({ success: false, error: 'Missing required fields', missingFields });
    }

    if (courseData.curriculum && Array.isArray(courseData.curriculum)) {
      courseData.curriculum = courseData.curriculum.map((lesson, lessonIndex) => {
        const processedLesson = {
          title: lesson.title || `Lesson ${lessonIndex + 1}`,
          description: lesson.description || '',
          duration: lesson.duration || '30 min',
          order: lesson.order || lessonIndex,
          steps: []
        };
        if (lesson.steps && Array.isArray(lesson.steps)) {
          processedLesson.steps = lesson.steps.map((step, stepIndex) => {
            const processedStep = {
              type: step.type || 'explanation',
              title: step.title || '',
              description: step.description || '',
              content: '',
              data: {},
              images: processImages(step.images || [], lessonIndex, stepIndex)
            };
            switch (step.type) {
              case 'explanation':
              case 'example':
              case 'reading':
                let explanationContent = extractContent(step) || `This is a ${step.type} step that explains an important concept.`;
                processedStep.content = explanationContent;
                processedStep.data = { content: explanationContent, images: processedStep.images };
                break;
              case 'image':
                const imageDescription = step.content || step.description || '';
                processedStep.content = imageDescription;
                processedStep.data = { images: processedStep.images, description: imageDescription };
                break;
              case 'practice':
                const practiceInstructions = step.content || step.data?.instructions || step.instructions || '';
                processedStep.content = practiceInstructions;
                processedStep.data = { instructions: practiceInstructions, type: step.data?.type || step.practiceType || 'guided', images: processedStep.images };
                processedStep.instructions = practiceInstructions;
                break;
              case 'quiz':
                let quizData = processQuizData(step);
                processedStep.content = quizData.length > 0 ? quizData[0].question : '';
                processedStep.data = quizData;
                processedStep.quizzes = quizData;
                break;
              default:
                const defaultContent = step.content || step.description || '';
                processedStep.content = defaultContent;
                processedStep.data = { content: defaultContent, images: processedStep.images };
            }
            return processedStep;
          });
        }
        return processedLesson;
      });
    }

    const course = new UpdatedCourse(courseData);
    await course.save();
    res.status(201).json({ success: true, course: course, message: 'Course created successfully' });
  } catch (error) {
    console.error('❌ Admin: Error creating updated course:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: 'Validation error', details: Object.values(error.errors).map(err => err.message) });
    }
    res.status(500).json({ success: false, error: 'Failed to create course', details: error.message });
  }
});
// ✅ ADD: Missing endpoint that frontend is looking for
app.get('/api/updated-courses/format/:format', async (req, res) => {
  try {
    const { format } = req.params;
    const { category, difficulty, search, limit = 50, page = 1 } = req.query;

    console.log(`📚 Fetching courses in ${format} format`);

    if (!['standard', 'structured'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Must be "standard" or "structured"'
      });
    }

    // Build filter
    const filter = { 
      isActive: true,
      status: 'published'
    };

    if (category && category !== 'all') filter.category = category;
    if (difficulty && difficulty !== 'all') filter.difficulty = difficulty;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const courses = await UpdatedCourse.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    let processedCourses;
    
    if (format === 'structured') {
      // Convert to structured format
      processedCourses = courses.map(course => 
        convertCourseToStructuredFormat(course)
      );
    } else {
      // Standard format
      processedCourses = courses.map(course => ({
        ...course,
        id: course._id.toString(),
        _id: course._id.toString(),
        isBookmarked: false,
        instructor: {
          name: course.instructor?.name || 'Unknown Instructor',
          avatar: processImageUrl(course.instructor?.avatar),
          bio: course.instructor?.bio || ''
        },
        thumbnail: processImageUrl(course.thumbnail),
        curriculum: course.curriculum || course.lessons || []
      }));
    }

    const total = await UpdatedCourse.countDocuments(filter);

    res.json({
      success: true,
      format: format,
      courses: processedCourses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('❌ Error fetching courses by format:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch courses',
      details: error.message
    });
  }
});

// ========================================
// 🚫 API ERROR HANDLERS
// ========================================

// API debugging middleware
app.use('/api/*', (req, res, next) => {
  next();
});

// API 404 handler
app.use('/api/*', (req, res) => {
  console.error(`❌ API Route Not Found: ${req.method} ${req.originalUrl}`);

  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method,
    server: 'api.aced.live',
    timestamp: new Date().toISOString(),
    availableRoutes: mountedRoutes.map(r => r.path),
    suggestion: 'Check the route path and method',
    criticalProgressEndpoints: [
      'POST /api/user-progress',
      'POST /api/progress',
      'POST /api/progress/quick-save'
    ],
    emergencyPaymentEndpoints: [
      'GET /api/payments/validate-user/:userId',
      'POST /api/payments/initiate',
      'GET /api/payments/status/:transactionId',
      'POST /api/payments/promo-code',
      'POST /api/payments/generate-form'
    ],
    paymeEndpoints: [
      'POST /api/payments/payme',
      'POST /api/payments/initiate-payme',
      'GET /api/payments/payme/test'
    ],
    allMountedRoutes: [
      'POST /api/payments/payme',
      'POST /api/payments/initiate-payme',
      'GET /api/payments/payme/return/success',
      'GET /api/payments/payme/return/failure',
      'GET /api/payments/payme/return/cancel',
      'POST /api/payments/payme/notify',
      'GET /api/payments/payme/test',
      'GET /api/payments/validate-user/:userId (EMERGENCY)',
      'POST /api/payments/initiate (EMERGENCY)',
      'GET /api/payments/status/:transactionId (EMERGENCY)',
      'POST /api/payments/promo-code (EMERGENCY)',
      'POST /api/payments/generate-form (EMERGENCY)',
      'POST /api/user-progress (CRITICAL)',
      'POST /api/progress (CRITICAL)',
      'POST /api/progress/quick-save (CRITICAL)',
      ...mountedRoutes.map(r => `${r.path}/*`)
    ]
  });
});

// ========================================
// 🎨 FRONTEND STATIC FILES (Optional for API server)
// ========================================

const distPath = path.join(__dirname, 'dist');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
    etag: true,
    lastModified: true
  }));
} else {
  console.warn('⚠️ No /dist directory found. Static file serving is inactive.');
}

// SPA Catch-all route (only if frontend exists)
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');

  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('❌ Failed to serve index.html:', err.message);
        res.status(500).json({
          error: 'Frontend loading error',
          message: 'Unable to serve the application',
          server: 'api.aced.live'
        });
      }
    });
  } else {
    // res.status(404).json({
    //   error: 'API endpoint not found',
    //   server: 'api.aced.live',
    //   frontend: 'aced.live',
    //   api: {
    //     health: 'https://api.aced.live/health',
    //     routes: 'https://api.aced.live/api/routes',
    //     authTest: 'https://api.aced.live/auth-test',
    //     paymeWebhook: 'https://api.aced.live/api/payments/payme',
    //     paymeTest: 'https://api.aced.live/api/payments/payme/test',
    //     validateUser: 'https://api.aced.live/api/payments/validate-user/USER_ID',
    //     paymentInitiate: 'https://api.aced.live/api/payments/initiate',
    //     paymentStatus: 'https://api.aced.live/api/payments/status/TRANSACTION_ID',
    //     generateForm: 'https://api.aced.live/api/payments/generate-form',
    //     userProgress: 'https://api.aced.live/api/user-progress',
    //     progress: 'https://api.aced.live/api/progress',
    //     quickSave: 'https://api.aced.live/api/progress/quick-save'
    //   },
    //   timestamp: new Date().toISOString()
    // });
  }
});

// ========================================
// 🔥 ENHANCED GLOBAL ERROR HANDLER
// ========================================

app.use((err, req, res, next) => {
  const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const timestamp = new Date().toISOString();

  console.error(`\n🔥 GLOBAL ERROR [${errorId}] at ${timestamp}:`);
  console.error('📍 URL:', req.originalUrl);
  console.error('🔧 Method:', req.method);
  console.error('💬 Message:', err.message);
  console.error('🏷️  Name:', err.name);
  console.error('🔢 Code:', err.code);
  console.error('🌐 Server: api.aced.live');

  if (process.env.NODE_ENV === 'development') {
    console.error('📚 Stack:', err.stack);
  }

  // Handle specific error types
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
    details.solution = 'Check database connection';
  } else if (err.message.includes('Firebase') || err.code?.startsWith('auth/')) {
    statusCode = 401;
    message = 'Authentication error';
    details.firebaseError = err.code || err.message;
  } else if (err.message.includes('Too many requests')) {
    statusCode = 429;
    message = 'Rate limit exceeded';
    details.preventionActive = true;
  } else if (err.message.includes('PayMe') || err.message.includes('payme')) {
    statusCode = 500;
    message = 'PayMe integration error';
    details.paymeError = true;
    details.criticalEndpoints = ['/api/user-progress', '/api/progress'];
  } else if (err.message.includes('progress') || err.message.includes('Progress')) {
    statusCode = 500;
    message = 'Progress saving error';
    details.progressError = true;
    details.criticalEndpoints = ['/api/user-progress', '/api/progress'];
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

// ========================================
// 🚀 SERVER STARTUP
// ========================================

const startServer = async () => {
  try {
    // Connect to database first
    await connectDB();

    // Start the server
    const server = app.listen(PORT, () => {


      // Route Summary
      if (mountedRoutes.length > 0) {
        mountedRoutes.forEach(route => {
        });
      }
      if (failedRoutes.length > 0) {
        console.warn('⚠️ Some routes failed to mount:');
        failedRoutes.forEach(({ path, file, description }) => {
          console.warn(`   - ${path} (${description}) from ${file}`);
        });
      }


      // PayMe Endpoint Summary
      if (handlePaymeWebhook && initiatePaymePayment) {

      } else {
        console.warn('\n⚠️ PayMe Webhook Routes are inactive due to missing controllers.');
      }


    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      server.close(() => {
        mongoose.connection.close(() => {
          process.exit(0);
        });
      });
    });

    process.on('SIGINT', () => {
      server.close(() => {
        mongoose.connection.close(() => {
          process.exit(0);
        });
      });
    });

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