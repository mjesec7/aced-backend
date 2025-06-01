// ========================================
// 🔧 COMPLETE MONGOOSE DEBUG SETUP
// ========================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables first
dotenv.config();

// Enable Mongoose debugging to see all queries
mongoose.set('debug', process.env.NODE_ENV === 'development');

// Enhanced Firebase ENV debugging
console.log("🧪 ENVIRONMENT DEBUG:", {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
  projectId: process.env.FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing',
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? '✅ Set' : '❌ Missing',
  privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length || 0,
  hasNewlinesEscaped: process.env.FIREBASE_PRIVATE_KEY?.includes('\\n'),
  mongoUri: process.env.MONGO_URI ? '✅ Set' : '❌ Missing',
  mongoUriStart: process.env.MONGO_URI?.substring(0, 20) + '...' || 'Not set'
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
  
  // Log POST/PUT request bodies (excluding sensitive data)
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    const logData = { ...req.body };
    // Remove sensitive fields from logs
    delete logData.password;
    delete logData.privateKey;
    delete logData.token;
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
  'https://admin.aced.live',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
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
      console.log('✅ CORS: No origin (mobile/desktop app)');
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
    'Origin'
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
      serverSelectionTimeoutMS: 5000,  // Reduced from 10000 for faster failure detection
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      
      // Pool settings
      maxPoolSize: 10,
      minPoolSize: 2,
      
      // Retry settings
      retryWrites: true,
      retryReads: true,
      
      // Buffer settings - FIXED for Mongoose 8.x
      bufferCommands: false,  // Disable command buffering
      // Removed maxBufferSize as it's not supported in newer versions
      
      // Heartbeat
      heartbeatFrequencyMS: 10000,
      
      // Auto-reconnect settings
      autoIndex: process.env.NODE_ENV !== 'production', // Only in development
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
// 🏥 ENHANCED HEALTH CHECK
// ========================================

app.get('/health', async (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
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
          timestamp: new Date().toISOString()
        });
      }
      
      console.log('🔐 Auth test successful for:', req.user?.email);
      res.json({ 
        message: `✅ Authentication successful for ${req.user?.email}`,
        uid: req.user?.uid,
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    console.error('🔐 Auth middleware error:', error.message);
    res.status(500).json({
      error: 'Auth system error',
      message: 'Authentication middleware not available',
      timestamp: new Date().toISOString()
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

// ✅ FIXED: Routes to mount with proper paths
const routesToMount = [
  ['/api/progress', './routes/progressRoutes', 'Progress tracking routes'],
  ['/api/users', './routes/userRoutes', 'User management routes (MAIN)'], // This is the main one
  ['/api/user', './routes/userRoutes', 'User management routes (LEGACY)'], // Mount same routes at /api/user for compatibility
  ['/api/lessons', './routes/lessonRoutes', 'Lesson management routes'],
  ['/api/subjects', './routes/subjectRoutes', 'Subject management routes'],
  ['/api/topics', './routes/topicRoutes', 'Topic management routes'],
  ['/api/chat', './routes/chatRoutes', 'Chat/AI routes'],
  ['/api/homeworks', './routes/homeworkRoutes', 'Homework routes'],
  ['/api/tests', './routes/testRoutes', 'Test/quiz routes'],
  ['/api/analytics', './routes/userAnalytics', 'User analytics routes'],
  ['/api/payments', './routes/paymeRoutes', 'Payment processing routes'],
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
  failedRoutes.forEach(({ path, description }) => {
    console.warn(`   ${path} - ${description}`);
  });
}

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
    timestamp: new Date().toISOString(),
    availableRoutes: mountedRoutes.map(r => r.path),
    suggestion: 'Check the route path and method'
  });
});

// ========================================
// 🎨 FRONTEND STATIC FILES
// ========================================

const distPath = path.join(__dirname, 'dist');
const fs = require('fs');

if (fs.existsSync(distPath)) {
  console.log('✅ Frontend dist directory found');
  app.use(express.static(distPath, {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
    etag: true,
    lastModified: true
  }));
} else {
  console.warn('⚠️  Frontend dist directory not found - API only mode');
}

// SPA Catch-all route
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('❌ Failed to serve index.html:', err.message);
        res.status(500).json({ 
          error: 'Frontend loading error',
          message: 'Unable to serve the application'
        });
      }
    });
  } else {
    res.status(404).json({
      error: 'Frontend not found',
      message: 'This appears to be an API-only server',
      api: {
        health: '/health',
        documentation: 'Check /health for available routes'
      }
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
  }
  
  const errorResponse = {
    error: message,
    errorId,
    timestamp,
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
      code: err.code
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
      console.log('\n🎉 SERVER STARTED SUCCESSFULLY!');
      console.log('================================');
      console.log(`🚀 Port: ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Node.js: ${process.version}`);
      console.log(`📊 Mongoose: ${mongoose.version}`);
      console.log(`🔗 Health: http://localhost:${PORT}/health`);
      console.log(`🧪 Auth test: http://localhost:${PORT}/auth-test`);
      console.log(`📊 Routes: ${mountedRoutes.length} mounted`);
      console.log('================================\n');
      
      if (mountedRoutes.length > 0) {
        console.log('📋 Available Routes:');
        mountedRoutes.forEach(route => {
          console.log(`   ${route.path} - ${route.description}`);
        });
        console.log('');
      }
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('⚠️  SIGTERM received, shutting down...');
      server.close(() => {
        mongoose.connection.close();
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      console.log('⚠️  SIGINT received, shutting down...');
      server.close(() => {
        mongoose.connection.close();
        process.exit(0);
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
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;