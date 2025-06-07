// server.js
// ========================================
// 🔧 COMPLETE MONGOOSE DEBUG SETUP WITH PAYME INTEGRATION
// ========================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Load environment variables first
dotenv.config();

// Enable Mongoose debugging to see all queries
mongoose.set('debug', process.env.NODE_ENV === 'development');

// Enhanced Environment debugging including PayMe
console.log("🧪 ENVIRONMENT DEBUG:", {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
  projectId: process.env.FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing',
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? '✅ Set' : '❌ Missing',
  privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length || 0,
  hasNewlinesEscaped: process.env.FIREBASE_PRIVATE_KEY?.includes('\\n'),
  mongoUri: process.env.MONGO_URI ? '✅ Set' : '❌ Missing',
  mongoUriStart: process.env.MONGO_URI?.substring(0, 20) + '...' || 'Not set',
  // PayMe Configuration
  paymeMerchantKey: process.env.PAYME_MERCHANT_KEY ? '✅ Set' : '❌ Missing',
  paymeTestMode: process.env.PAYME_TEST_MODE || 'true',
  paymeEndpoint: process.env.PAYME_ENDPOINT || 'https://checkout.test.paycom.uz/api',
  // Production Environment Check
  isProduction: process.env.NODE_ENV === 'production',
  serverDomain: 'api.aced.live',
  frontendDomain: 'aced.live'
});

const app = express();
const PORT = process.env.PORT || 5000;

// ========================================
// 🛡️ SECURITY & PERFORMANCE MIDDLEWARES
// ========================================

app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: false,
}));

app.use(compression());

// Enhanced JSON parsing with error handling
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
// 🔍 ENHANCED REQUEST LOGGING
// ========================================

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n📅 [${timestamp}] ${req.method} ${req.url}`);
  console.log(`🌐 Origin: ${req.headers.origin || 'Direct access'}`);
  console.log(`🔑 Auth: ${req.headers.authorization ? 'Present' : 'None'}`);
  console.log(`🆔 User-Agent: ${req.headers['user-agent']?.substring(0, 50)}...`);
  
  // Special logging for PayMe webhooks
  if (req.url.includes('/payme') || req.url.includes('/payment')) {
    console.log('💳 PayMe/Payment Request Detected');
    console.log(`📋 Headers:`, {
      'content-type': req.headers['content-type'],
      'authorization': req.headers.authorization ? 'Present' : 'None',
      'x-forwarded-for': req.headers['x-forwarded-for']
    });
  }
  
  // Log POST/PUT request bodies (excluding sensitive data)
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    const logData = { ...req.body };
    // Remove sensitive fields from logs
    delete logData.password;
    delete logData.privateKey;
    delete logData.token;
    delete logData.card;
    console.log('📦 Request body:', JSON.stringify(logData, null, 2));
  }
  
  // Log response time
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`⏱️  Response: ${res.statusCode} (${duration}ms)`);
  });
  
  next();
});

// ========================================
// 🌐 ENHANCED CORS CONFIGURATION
// ========================================

const allowedOrigins = [
  'https://aced.live',
  'https://www.aced.live',
  'https://admin.aced.live',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  // PayMe allowed origins
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
    console.log('🔍 CORS Check for:', origin);
    
    if (!origin) {
      console.log('✅ CORS: No origin (mobile/desktop app or webhook)');
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      console.log('✅ CORS: Origin allowed');
      callback(null, true);
    } else {
      console.warn('❌ CORS: Origin blocked -', origin);
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
    'X-Auth'
  ],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400,
}));

app.options('*', cors());

// ========================================
// 💾 IMPROVED MONGODB CONNECTION
// ========================================

const connectDB = async () => {
  try {
    console.log('\n🔌 Attempting MongoDB connection...');
    console.log(`📊 Mongoose version: ${mongoose.version}`);
    console.log(`📊 Node.js version: ${process.version}`);
    
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
    
    console.log('🔧 Connection options:', {
      serverSelectionTimeoutMS: connectionOptions.serverSelectionTimeoutMS,
      bufferCommands: connectionOptions.bufferCommands,
      maxPoolSize: connectionOptions.maxPoolSize,
      mongooseVersion: mongoose.version
    });
    
    // Attempt connection
    await mongoose.connect(process.env.MONGO_URI, connectionOptions);
    
    console.log('✅ MongoDB connected successfully!');
    console.log(`📍 Database: ${mongoose.connection.name}`);
    console.log(`🏠 Host: ${mongoose.connection.host}:${mongoose.connection.port}`);
    console.log(`🔄 Ready state: ${mongoose.connection.readyState}`);
    
    // Connection event listeners
    mongoose.connection.on('connected', () => {
      console.log('🔗 Mongoose connected to MongoDB');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
      if (err.stack && process.env.NODE_ENV === 'development') {
        console.error('Stack:', err.stack);
      }
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  Mongoose disconnected from MongoDB');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('🔄 Mongoose reconnected to MongoDB');
    });
    
    // Test the connection
    await mongoose.connection.db.admin().ping();
    console.log('✅ Database ping successful');
    
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
      console.log('🔧 Continuing in development mode without database...');
    }
  }
};

// ========================================
// 💳 PAYME UTILITY FUNCTIONS
// ========================================

class PayMeError extends Error {
  constructor(code, message, data = null) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

const PayMeErrorCodes = {
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  INVALID_ACCOUNT: -31050,
  UNABLE_TO_PERFORM: -31008,
  TRANSACTION_CANCELLED: -31007,
  ALREADY_DONE: -31060,
  PENDING_PAYMENT: -31061,
  INVALID_AUTHORIZATION: -32504,
  ACCESS_DENIED: -32401,
  METHOD_NOT_FOUND: -32601,
  INVALID_JSON_RPC: -32700
};

// PayMe authorization check
const checkPayMeAuth = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    throw new PayMeError(PayMeErrorCodes.INVALID_AUTHORIZATION, 'Invalid authorization header');
  }
  
  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
  const [username, password] = credentials.split(':');
  
  if (username !== 'Paycom' || password !== process.env.PAYME_MERCHANT_KEY) {
    throw new PayMeError(PayMeErrorCodes.ACCESS_DENIED, 'Access denied');
  }
};

// Validate transaction amount (in tiyin - 1 sum = 100 tiyin)
const validateAmount = (amount) => {
  if (!amount || amount < 100) { // Minimum 1 sum
    throw new PayMeError(PayMeErrorCodes.INVALID_AMOUNT, 'Invalid amount');
  }
  return true;
};

// ========================================
// 🏥 ENHANCED HEALTH CHECK
// ========================================

app.get('/health', async (req, res) => {
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
      configured: !!process.env.PAYME_MERCHANT_KEY,
      testMode: process.env.NODE_ENV !== 'production',
      merchantKey: process.env.PAYME_MERCHANT_KEY ? 'Set' : 'Missing',
      sandboxEndpoint: 'https://api.aced.live/api/payments/sandbox'
    },
    firebase: {
      projectId: process.env.FIREBASE_PROJECT_ID || 'Not set',
      configured: !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
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
});

// ========================================
// 🔐 AUTH TEST ENDPOINT WITH ERROR HANDLING
// ========================================

app.get('/auth-test', async (req, res) => {
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
      
      console.log('🔐 Auth test successful for:', req.user?.email);
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
});

// ========================================
// 💳 PAYME RPC ENDPOINT (PRODUCTION)
// ========================================

app.post('/api/payments/payme', async (req, res) => {
  console.log('\n💳 PayMe RPC Request received');
  
  try {
    // Check PayMe authorization for production
    if (process.env.NODE_ENV === 'production') {
      checkPayMeAuth(req);
    }
    
    const { method, params } = req.body;
    
    if (!method) {
      throw new PayMeError(PayMeErrorCodes.METHOD_NOT_FOUND, 'Method not found');
    }
    
    console.log(`🔧 PayMe Method: ${method}`);
    console.log(`📋 PayMe Params:`, params);
    
    let result;
    
    switch (method) {
      case 'CheckPerformTransaction':
        result = await handleCheckPerformTransaction(params);
        break;
        
      case 'CreateTransaction':
        result = await handleCreateTransaction(params);
        break;
        
      case 'PerformTransaction':
        result = await handlePerformTransaction(params);
        break;
        
      case 'CancelTransaction':
        result = await handleCancelTransaction(params);
        break;
        
      case 'CheckTransaction':
        result = await handleCheckTransaction(params);
        break;
        
      case 'GetStatement':
        result = await handleGetStatement(params);
        break;
        
      default:
        throw new PayMeError(PayMeErrorCodes.METHOD_NOT_FOUND, `Method ${method} not found`);
    }
    
    const response = {
      jsonrpc: '2.0',
      id: req.body.id || null,
      result
    };
    
    console.log('✅ PayMe Response:', JSON.stringify(response, null, 2));
    res.json(response);
    
  } catch (error) {
    console.error('❌ PayMe Error:', error.message);
    
    const errorResponse = {
      jsonrpc: '2.0',
      id: req.body.id || null,
      error: {
        code: error.code || PayMeErrorCodes.INVALID_JSON_RPC,
        message: error.message,
        data: error.data || null
      }
    };
    
    res.json(errorResponse);
  }
});

// ========================================
// 💳 PAYME SANDBOX ENDPOINT (DEVELOPMENT/TESTING)
// ========================================

app.post('/api/payments/sandbox', async (req, res) => {
  console.log('\n🧪 PayMe Sandbox Request received on api.aced.live');
  
  try {
    const { handleSandboxPayment } = require('./controllers/paymentController');
    return handleSandboxPayment(req, res);
  } catch (error) {
    console.error('❌ Sandbox route error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32000,
        message: { ru: 'Ошибка сервера', en: 'Server error' },
        data: error.message
      }
    });
  }
});

// ========================================
// 💳 PAYME RPC HANDLERS (PLACEHOLDER IMPLEMENTATIONS)
// ========================================

const handleCheckPerformTransaction = async (params) => {
  console.log('🔍 CheckPerformTransaction');
  
  const { amount, account } = params;
  
  // Validate amount
  validateAmount(amount);
  
  // Check if account exists
  if (!account || !account.user_id) {
    throw new PayMeError(PayMeErrorCodes.INVALID_ACCOUNT, 'Invalid account');
  }
  
  return {
    allow: true
  };
};

const handleCreateTransaction = async (params) => {
  console.log('🆕 CreateTransaction');
  
  const { id, time, amount, account } = params;
  
  validateAmount(amount);
  
  if (!account || !account.user_id) {
    throw new PayMeError(PayMeErrorCodes.INVALID_ACCOUNT, 'Invalid account');
  }
  
  const transaction = {
    id: id,
    time: time,
    amount: amount,
    account: account,
    state: 1, // Created state
    create_time: Date.now(),
    perform_time: 0,
    cancel_time: 0,
    reason: null
  };
  
  console.log('📝 Transaction created:', transaction);
  
  return {
    create_time: transaction.create_time,
    transaction: transaction.id.toString(),
    state: transaction.state
  };
};

const handlePerformTransaction = async (params) => {
  console.log('✅ PerformTransaction');
  
  const { id } = params;
  
  if (!id) {
    throw new PayMeError(PayMeErrorCodes.TRANSACTION_NOT_FOUND, 'Transaction not found');
  }
  
  const transaction = {
    id: id,
    state: 2, // Performed state
    perform_time: Date.now()
  };
  
  console.log('✅ Transaction performed:', transaction);
  
  return {
    perform_time: transaction.perform_time,
    transaction: transaction.id.toString(),
    state: transaction.state
  };
};

const handleCancelTransaction = async (params) => {
  console.log('❌ CancelTransaction');
  
  const { id, reason } = params;
  
  if (!id) {
    throw new PayMeError(PayMeErrorCodes.TRANSACTION_NOT_FOUND, 'Transaction not found');
  }
  
  const transaction = {
    id: id,
    state: -1, // Cancelled state
    cancel_time: Date.now(),
    reason: reason
  };
  
  console.log('❌ Transaction cancelled:', transaction);
  
  return {
    cancel_time: transaction.cancel_time,
    transaction: transaction.id.toString(),
    state: transaction.state
  };
};

const handleCheckTransaction = async (params) => {
  console.log('🔍 CheckTransaction');
  
  const { id } = params;
  
  if (!id) {
    throw new PayMeError(PayMeErrorCodes.TRANSACTION_NOT_FOUND, 'Transaction not found');
  }
  
  const transaction = {
    id: id,
    state: 2,
    create_time: Date.now() - 3600000,
    perform_time: Date.now(),
    cancel_time: 0,
    reason: null
  };
  
  console.log('🔍 Transaction status:', transaction);
  
  return {
    create_time: transaction.create_time,
    perform_time: transaction.perform_time,
    cancel_time: transaction.cancel_time,
    transaction: transaction.id.toString(),
    state: transaction.state,
    reason: transaction.reason
  };
};

const handleGetStatement = async (params) => {
  console.log('📊 GetStatement');
  
  const { from, to } = params;
  
  const transactions = [
    {
      id: 'example_transaction_id',
      time: Date.now(),
      amount: 10000,
      account: { user_id: 'example_user' },
      create_time: Date.now() - 7200000,
      perform_time: Date.now() - 3600000,
      cancel_time: 0,
      transaction: 'example_transaction_id',
      state: 2,
      reason: null
    }
  ];
  
  console.log('📊 Statement returned:', transactions.length, 'transactions');
  
  return {
    transactions: transactions
  };
};

// ========================================
// 💳 PAYME PAYMENT INITIATION ENDPOINT
// ========================================

app.post('/api/payments/initiate', async (req, res) => {
  try {
    console.log('🚀 Payment initiation request');
    
    const { amount, userId, description } = req.body;
    
    if (!amount || !userId) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['amount', 'userId'],
        server: 'api.aced.live'
      });
    }
    
    // Convert amount to tiyin (1 UZS = 100 tiyin)
    const amountInTiyin = Math.round(amount * 100);
    
    // Generate payment URL for PayMe
    const merchantId = process.env.PAYME_MERCHANT_ID;
    const account = encodeURIComponent(JSON.stringify({ user_id: userId }));
    const amountParam = amountInTiyin;
    
    const isProduction = process.env.NODE_ENV === 'production';
    const paymentUrl = isProduction 
      ? `https://checkout.paycom.uz/${merchantId}?amount=${amountParam}&account=${account}`
      : `https://aced.live/payment/checkout/${userId}?amount=${amount}`;
    
    console.log('💳 Payment URL generated:', paymentUrl);
    
    res.json({
      success: true,
      paymentUrl,
      amount: amount,
      amountInTiyin,
      userId,
      description,
      server: 'api.aced.live',
      environment: isProduction ? 'production' : 'sandbox',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Payment initiation error:', error);
    res.status(500).json({
      error: 'Payment initiation failed',
      message: error.message,
      server: 'api.aced.live'
    });
  }
});

// ========================================
// 📁 IMPROVED ROUTE MOUNTING
// ========================================

const mountRoute = (path, routeFile, description) => {
  try {
    console.log(`📦 Mounting ${description}...`);
    const route = require(routeFile);
    
    // Add error handling middleware for each route
    app.use(path, (req, res, next) => {
      console.log(`🔍 Route hit: ${path} - ${req.method} ${req.originalUrl}`);
      next();
    }, route);
    
    console.log(`✅ Successfully mounted ${path} - ${description}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to mount ${path}:`, error.message);
    console.error(`   Route file: ${routeFile}`);
    return false;
  }
};

// ✅ TEST: Check if userRoutes can be loaded
console.log('🔍 Testing userRoutes loading...');
try {
  const testUserRoutes = require('./routes/userRoutes');
  console.log('✅ userRoutes loaded successfully');
} catch (error) {
  console.error('❌ CRITICAL: userRoutes failed to load:', error.message);
  console.error('❌ Stack:', error.stack);
}

// ✅ Routes to mount in correct order (only mount existing files)
const routesToMount = [
  // PayMe routes FIRST (most specific)
  ['/api/payments', './routes/paymeRoutes', 'PayMe payment routes'],
  
  // User routes - CRITICAL
  ['/api/users', './routes/userRoutes', 'User management routes (MAIN)'],
  ['/api/user', './routes/userRoutes', 'User management routes (LEGACY)'],
  
  // Only mount routes that exist - comment out missing ones
  // ['/api/progress', './routes/progressRoutes', 'Progress tracking routes'],
  // ['/api/lessons', './routes/lessonRoutes', 'Lesson management routes'],
  // ['/api/subjects', './routes/subjectRoutes', 'Subject management routes'],
  ['/api/topics', './routes/topicRoutes', 'Topic management routes'],
  // ['/api/chat', './routes/chatRoutes', 'Chat/AI routes'],
  // ['/api/homeworks', './routes/homeworkRoutes', 'Homework routes'],
  // ['/api/tests', './routes/testRoutes', 'Test/quiz routes'],
  // ['/api/analytics', './routes/userAnalytics', 'User analytics routes'],
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

console.log('\n📋 ROUTE MOUNTING SUMMARY:');
console.log(`✅ Successfully mounted: ${mountedRoutes.length}`);
console.log(`❌ Failed to mount: ${failedRoutes.length}`);

if (failedRoutes.length > 0) {
  console.warn('\n⚠️  FAILED ROUTES:');
  failedRoutes.forEach(({ path, file, description }) => {
    console.warn(`   ${path} - ${description} (${file})`);
  });
  console.warn('\n💡 To fix: Check if these route files exist and have no syntax errors');
}

// ✅ EMERGENCY FIX: Add user save route directly since userRoutes might be failing
console.log('🚨 Adding emergency user save route...');

// ✅ EMERGENCY FIX: Add user save route directly (FIXED VERSION)
app.post('/api/users/save', async (req, res) => {
  console.log('💾 Emergency save route hit on api.aced.live');
  
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
    
    console.log('🔍 Verifying token in emergency route...');
    const decoded = await admin.auth().verifyIdToken(token);
    
    console.log('✅ Token verified:', {
      uid: decoded.uid,
      email: decoded.email,
      aud: decoded.aud
    });
    
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
      console.log('👤 Creating new user via emergency route');
      user = new User({ 
        firebaseId, 
        email, 
        name, 
        login: email,
        subscriptionPlan: subscriptionPlan || 'free' 
      });
    } else {
      console.log('📝 Updating existing user via emergency route');
      user.email = email;
      user.name = name;
      user.login = email;
      if (subscriptionPlan) user.subscriptionPlan = subscriptionPlan;
    }

    await user.save();
    console.log('✅ User saved via emergency route');
    
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
    ]
  });
});

console.log('✅ Emergency user routes added');

// ========================================
// 🔍 ROUTE DIAGNOSTICS ENDPOINT
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
    paymeRoutes: [
      { path: '/api/payments/payme', methods: 'POST', description: 'PayMe RPC endpoint' },
      { path: '/api/payments/sandbox', methods: 'POST', description: 'PayMe sandbox endpoint' },
      { path: '/api/payments/initiate', methods: 'POST', description: 'Payment initiation' }
    ],
    mountedRoutes: mountedRoutes.map(r => r.path),
    timestamp: new Date().toISOString()
  });
});

// ========================================
// 🚫 API ERROR HANDLERS
// ========================================

// API debugging middleware
app.use('/api/*', (req, res, next) => {
  console.log(`🔍 API Request: ${req.method} ${req.originalUrl}`);
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
    paymeEndpoints: [
      'POST /api/payments/sandbox',
      'POST /api/payments/payme',
      'POST /api/payments/initiate',
      'POST /api/payments/promo-code',
      'POST /api/payments/initiate-payme'
    ]
  });
});

// ========================================
// 🎨 FRONTEND STATIC FILES (Optional for API server)
// ========================================

const distPath = path.join(__dirname, 'dist');

if (fs.existsSync(distPath)) {
  console.log('✅ Frontend dist directory found on API server');
  app.use(express.static(distPath, {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
    etag: true,
    lastModified: true
  }));
} else {
  console.log('ℹ️  No frontend dist directory - API only mode (normal for api.aced.live)');
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
        authTest: 'https://api.aced.live/auth-test'
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
      console.log('\n🎉 API SERVER STARTED SUCCESSFULLY!');
      console.log('=====================================');
      console.log(`🚀 Port: ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Server: api.aced.live`);
      console.log(`🖥️  Frontend: aced.live`);
      console.log(`📊 Node.js: ${process.version}`);
      console.log(`📊 Mongoose: ${mongoose.version}`);
      console.log(`🔗 Health: https://api.aced.live/health`);
      console.log(`🧪 Auth test: https://api.aced.live/auth-test`);
      console.log(`🔍 Routes debug: https://api.aced.live/api/routes`);
      console.log(`💳 PayMe sandbox: https://api.aced.live/api/payments/sandbox`);
      console.log(`📊 Routes: ${mountedRoutes.length} mounted`);
      console.log('=====================================\n');
      
      if (mountedRoutes.length > 0) {
        console.log('📋 Available Route Groups:');
        mountedRoutes.forEach(route => {
          console.log(`   ${route.path} - ${route.description}`);
        });
        console.log('');
      }

      // Show PayMe configuration
      console.log('💳 PayMe Configuration:');
      console.log(`   Merchant Key: ${process.env.PAYME_MERCHANT_KEY ? '✅ Set' : '❌ Missing'}`);
      console.log(`   Environment: ${process.env.NODE_ENV === 'production' ? 'Production' : 'Sandbox/Development'}`);
      console.log(`   Sandbox URL: https://api.aced.live/api/payments/sandbox`);
      console.log('');

      // Show Firebase configuration
      console.log('🔥 Firebase Configuration:');
      console.log(`   Project ID: ${process.env.FIREBASE_PROJECT_ID || 'Not set'}`);
      console.log(`   Client Email: ${process.env.FIREBASE_CLIENT_EMAIL ? '✅ Set' : '❌ Missing'}`);
      console.log(`   Private Key: ${process.env.FIREBASE_PRIVATE_KEY ? '✅ Set' : '❌ Missing'}`);
      console.log('');
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('⚠️  SIGTERM received, shutting down gracefully...');
      server.close(() => {
        console.log('🔌 HTTP server closed');
        mongoose.connection.close(() => {
          console.log('💾 MongoDB connection closed');
          process.exit(0);
        });
      });
    });
    
    process.on('SIGINT', () => {
      console.log('⚠️  SIGINT received, shutting down gracefully...');
      server.close(() => {
        console.log('🔌 HTTP server closed');
        mongoose.connection.close(() => {
          console.log('💾 MongoDB connection closed');
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
  console.error('🌐 Server: api.aced.live');
  
  if (process.env.NODE_ENV === 'production') {
    console.error('🚨 Exiting due to unhandled rejection in production');
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('🌐 Server: api.aced.live');
  console.error('🚨 Exiting due to uncaught exception');
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;