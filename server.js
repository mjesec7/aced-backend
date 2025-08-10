// server.js - COMPLETE UPDATED VERSION WITH PROGRESS FIXES AND PAYME INTEGRATION
// ========================================
// 🔧 COMPLETE MONGOOSE DEBUG SETUP WITH PAYME INTEGRATION AND PROGRESS FIXES
// ========================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables first
dotenv.config();

// Enable Mongoose debugging to see all queries
mongoose.set('debug', process.env.NODE_ENV === 'development');

// Enhanced  debugging including PayMe


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
    
    // Handle connection close
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

app.post('/api/payments/promo-code', async (req, res) => {
  try {
    const { userId, plan, promoCode } = req.body;
    
    if (!userId || !plan || !promoCode) {
      return res.status(400).json({ 
        success: false, 
        error: 'Заполните все поля' 
      });
    }

    // ✅ Check if promocode exists in database
    const Promocode = require('./models/promoCode');
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

    // ✅ Check if promocode grants the right plan
    if (promocode.grantsPlan !== plan) {
      return res.status(400).json({ 
        success: false, 
        error: `Этот промокод для плана ${promocode.grantsPlan.toUpperCase()}` 
      });
    }

    // ✅ SIMPLE: Just update user status
    const User = require('./models/user');
    const user = await User.findOne({ firebaseId: userId });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'Пользователь не найден' 
      });
    }

    // ✅ Update user subscription
    user.subscriptionPlan = plan;
    await user.save();

    // ✅ Update promocode usage
    promocode.currentUses = (promocode.currentUses || 0) + 1;
    await promocode.save();


    res.json({
      success: true,
      message: `Промокод применён! Активирован план ${plan.toUpperCase()}`
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
          <!-- Required merchant information -->
          <input type="hidden" name="merchant" value="${merchantId}" />
          <input type="hidden" name="amount" value="${amount}" />
          
          <!-- ✅ CRITICAL FIX: Use Login field instead of Login -->
          <input type="hidden" name="account[Login]" value="${user._id}" />
          
          <!-- Optional parameters -->
          <input type="hidden" name="lang" value="${lang}" />
          <input type="hidden" name="callback" value="https://api.aced.live/api/payments/payme/return/success?transaction=${transactionId}&userId=${userId}" />
          <input type="hidden" name="callback_timeout" value="15000" />
          <input type="hidden" name="description" value="ACED ${plan.toUpperCase()} Plan Subscription" />
          <input type="hidden" name="currency" value="UZS" />
          
          <!-- Receipt details -->
          ${detailBase64 ? `<input type="hidden" name="detail" value="${detailBase64}" />` : ''}
          
          <!-- Submit button (hidden, auto-submit) -->
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

  
  // PayMe routes (legacy)
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
  ['/api/vocabulary', './routes/vocabularyRoutes', 'Vocabulary management routes'],
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
  failedRoutes.forEach(({ path, file, description }) => {
  });
}

// ✅ EMERGENCY FIX: Add user save route directly since userRoutes might be failing

// ✅ EMERGENCY FIX: Add user save route directly (FIXED VERSION)
app.post('/api/users/save', async (req, res) => {
  
  const { token, name, subscriptionPlan } = req.body;
  
  if (!token || !name) {
    return res.status(400).json({ 
      error: '❌ Missing token or name',
      server: 'api.aced.live'
    });
  }
  
  try {
    // ✅ Import Firebase Admin directly, not through config
    const admin = require('firebase-admin');
    const User = require('./models/user');
    
    const decoded = await admin.auth().verifyIdToken(token);
    
    
    
    if (decoded.aud !== 'aced-9cf72') {
      return res.status(403).json({ 
        error: '❌ Token from wrong Firebase project',
        expected: 'aced-9cf72',
        received: decoded.aud
      });
    }
    
    const firebaseId = decoded.uid;
    const email = decoded.email;

    let user = await User.findOne({ firebaseId });
    if (!user) {
      user = new User({ 
        firebaseId, 
        email, 
        name, 
        Login: email,
        subscriptionPlan: subscriptionPlan || 'free' 
      });
    } else {
      user.email = email;
      user.name = name;
      user.Login = email;
      if (subscriptionPlan) user.subscriptionPlan = subscriptionPlan;
    }

    await user.save();
    
    res.json({
      ...user.toObject(),
      message: '✅ User saved via emergency route',
      server: 'api.aced.live'
    });
    
  } catch (err) {
    console.error('❌ Emergency save error:', err.message);
    res.status(401).json({ 
      error: '❌ Invalid Firebase token',
      details: err.message,
      server: 'api.aced.live'
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
      mainEndpoint: '/api/user-progress',
      alternativeEndpoint: '/api/progress',
      quickSaveEndpoint: '/api/progress/quick-save',
      emergencyRoutesActive: true
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
});app.get('/api/admin/users', async (req, res) => {
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
  
  res.json({
    server: 'api.aced.live',
    totalRoutes: routes.length,
    routes: groupedRoutes,
    allRoutes: routes,
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
    console.error('❌ Error saving user-progress lesson:', error);
    
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
      message: `Promocode ${finalCode} created successfully`
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
  
  // Group routes by prefix
  const groupedRoutes = {};
  routes.forEach(route => {
    const prefix = route.path.split('/')[1] || 'root';
    if (!groupedRoutes[prefix]) {
      groupedRoutes[prefix] = [];
    }
    groupedRoutes[prefix].push(route);
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
    res.status(404).json({
      error: 'API endpoint not found',
      message: 'This is the API server (api.aced.live)',
      server: 'api.aced.live',
      frontend: 'aced.live',
      api: {
        health: 'https://api.aced.live/health',
        routes: 'https://api.aced.live/api/routes',
        authTest: 'https://api.aced.live/auth-test',
        paymeWebhook: 'https://api.aced.live/api/payments/payme',
        paymeTest: 'https://api.aced.live/api/payments/payme/test',
        validateUser: 'https://api.aced.live/api/payments/validate-user/USER_ID',
        paymentInitiate: 'https://api.aced.live/api/payments/initiate',
        paymentStatus: 'https://api.aced.live/api/payments/status/TRANSACTION_ID',
        generateForm: 'https://api.aced.live/api/payments/generate-form',
        userProgress: 'https://api.aced.live/api/user-progress',
        progress: 'https://api.aced.live/api/progress',
        quickSave: 'https://api.aced.live/api/progress/quick-save'
      },
      timestamp: new Date().toISOString()
    });
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
      
      
      if (mountedRoutes.length > 0) {
        mountedRoutes.forEach(route => {
        });
      }

      




     

      // PayMe Endpoint Summary
      if (handlePaymeWebhook && initiatePaymePayment) {
        
      } else {
    
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
// ADD THIS TO YOUR SERVER.JS FILE RIGHT AFTER YOUR EXISTING ROUTES

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