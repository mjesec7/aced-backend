const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables first
dotenv.config();

// Enhanced Firebase ENV debugging
console.log("🧪 Firebase ENV DEBUG:", {
  projectId: process.env.FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing',
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? '✅ Set' : '❌ Missing',
  privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length || 0,
  hasNewlinesEscaped: process.env.FIREBASE_PRIVATE_KEY?.includes('\\n'),
  mongoUri: process.env.MONGO_URI ? '✅ Set' : '❌ Missing'
});

const app = express();
const PORT = process.env.PORT || 5000;

// ========================================
// 🛡️ SECURITY & PERFORMANCE MIDDLEWARES
// ========================================

app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: false, // Disable for development
}));

app.use(compression());

// Enhanced JSON parsing with error handling
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      console.error('❌ Invalid JSON received:', e.message);
      res.status(400).json({ 
        error: 'Invalid JSON format',
        message: 'Request body contains malformed JSON'
      });
      return;
    }
  }
}));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ========================================
// 🔍 ENHANCED REQUEST LOGGING
// ========================================

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`📅 [${timestamp}] ${req.method} ${req.url}`);
  console.log(`🌐 Origin: ${req.headers.origin || 'Direct access'}`);
  console.log(`🔑 Auth: ${req.headers.authorization ? 'Present' : 'None'}`);
  
  // Log POST/PUT request bodies (excluding sensitive data)
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    const logData = { ...req.body };
    // Remove sensitive fields from logs
    delete logData.password;
    delete logData.privateKey;
    delete logData.token;
    console.log('📦 Request body:', JSON.stringify(logData, null, 2));
  }
  
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
  allowedOrigins.push('http://localhost:5173', 'http://localhost:4173');
}

app.use(cors({
  origin: (origin, callback) => {
    console.log('🔍 CORS Check for:', origin);
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
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
  maxAge: 86400, // 24 hours
}));

// Handle preflight requests globally
app.options('*', cors());

// ========================================
// 🏥 ENHANCED HEALTH CHECK
// ========================================

app.get('/health', async (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    memory: process.memoryUsage(),
    database: 'disconnected',
    routes: {}
  };

  // Check MongoDB connection
  try {
    if (mongoose.connection.readyState === 1) {
      healthCheck.database = 'connected';
      await mongoose.connection.db.admin().ping();
    }
  } catch (error) {
    healthCheck.database = 'error';
    healthCheck.dbError = error.message;
  }

  // List all mounted routes
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push(`${Object.keys(middleware.route.methods).join(', ').toUpperCase()} ${middleware.route.path}`);
    } else if (middleware.name === 'router' && middleware.regexp.source) {
      const path = middleware.regexp.source.replace(/\\\//g, '/').replace(/\$.*/, '').replace(/\^/, '');
      routes.push(`ROUTER ${path}`);
    }
  });
  healthCheck.routes = routes;

  const statusCode = healthCheck.database === 'connected' ? 200 : 503;
  res.status(statusCode).json(healthCheck);
});

// ========================================
// 🔐 FIREBASE AUTH TEST ENDPOINT
// ========================================

const authenticateUser = require('./middlewares/authMiddleware');

app.get('/auth-test', authenticateUser, (req, res) => {
  console.log('🔐 Auth test successful for:', req.user.email);
  res.json({ 
    message: `✅ Authentication successful for ${req.user.email}`,
    uid: req.user.uid,
    timestamp: new Date().toISOString()
  });
});

// ========================================
// 📁 ROUTE MOUNTING WITH ERROR HANDLING
// ========================================

const mountRoute = (path, routeFile, description) => {
  try {
    console.log(`📦 Mounting ${description}...`);
    const route = require(routeFile);
    app.use(path, route);
    console.log(`✅ Successfully mounted ${path} - ${description}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to mount ${path}:`, error.message);
    console.error(`   Route file: ${routeFile}`);
    console.error(`   Stack: ${error.stack}`);
    return false;
  }
};

// Mount all routes with proper error handling
const routesToMount = [
  // CRITICAL: Progress routes MUST be mounted first to avoid conflicts
  ['/api/progress', './routes/progressRoutes', 'Progress tracking routes'],
  
  // User-related routes
  ['/api/users', './routes/userRoutes', 'User management routes'],
  ['/api/user', './routes/userLessonRoutes', 'User lesson routes (legacy)'],
  
  // Content routes
  ['/api/lessons', './routes/lessonRoutes', 'Lesson management routes'],
  ['/api/subjects', './routes/subjectRoutes', 'Subject management routes'],
  ['/api/topics', './routes/topicRoutes', 'Topic management routes'],
  
  // Feature routes
  ['/api/chat', './routes/chatRoutes', 'Chat/AI routes'],
  ['/api/homeworks', './routes/homeworkRoutes', 'Homework routes'],
  ['/api/tests', './routes/testRoutes', 'Test/quiz routes'],
  
  // Analytics and recommendations
  ['/api/analytics', './routes/userAnalytics', 'User analytics routes'],
  ['/api', './routes/recommendationRoutes', 'Recommendation engine routes'],
  
  // Payment integration
  ['/api/payments', './routes/paymeRoutes', 'Payment processing routes'],
];

// Mount routes and track success
const mountedRoutes = [];
const failedRoutes = [];

routesToMount.forEach(([path, file, description]) => {
  if (mountRoute(path, file, description)) {
    mountedRoutes.push({ path, description });
  } else {
    failedRoutes.push({ path, file, description });
  }
});

// Log mounting summary
console.log('\n📋 ROUTE MOUNTING SUMMARY:');
console.log(`✅ Successfully mounted: ${mountedRoutes.length}`);
console.log(`❌ Failed to mount: ${failedRoutes.length}`);

if (failedRoutes.length > 0) {
  console.warn('\n⚠️  FAILED ROUTES (Server will continue without these):');
  failedRoutes.forEach(({ path, description }) => {
    console.warn(`   ${path} - ${description}`);
  });
}

// ========================================
// 🔍 API DEBUGGING MIDDLEWARE
// ========================================

app.use('/api/*', (req, res, next) => {
  console.log(`🔍 API Request: ${req.method} ${req.originalUrl}`);
  console.log(`📊 Route Status:`, {
    mounted: mountedRoutes.length,
    failed: failedRoutes.length,
    timestamp: new Date().toISOString()
  });
  next();
});

// ========================================
// 🚫 API 404 HANDLER
// ========================================

app.use('/api/*', (req, res) => {
  console.error(`❌ API Route Not Found: ${req.method} ${req.originalUrl}`);
  console.error(`📍 Available routes: ${mountedRoutes.length} mounted`);
  
  const suggestions = [];
  
  // Provide helpful suggestions based on the requested path
  const path = req.originalUrl.toLowerCase();
  if (path.includes('progress')) {
    suggestions.push('Check /api/progress endpoints');
  }
  if (path.includes('user')) {
    suggestions.push('Try /api/users or /api/user');
  }
  if (path.includes('lesson')) {
    suggestions.push('Check /api/lessons endpoints');
  }
  
  res.status(404).json({ 
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    suggestions: suggestions.length > 0 ? suggestions : ['Check the API documentation'],
    availableRoutes: mountedRoutes.map(r => r.path)
  });
});

// ========================================
// 🎨 FRONTEND STATIC FILES (SPA)
// ========================================

const distPath = path.join(__dirname, 'dist');
console.log(`📁 Static files path: ${distPath}`);

// Check if dist directory exists
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

// SPA Catch-all route (MUST be last)
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
        documentation: 'Check mounted routes in /health endpoint'
      }
    });
  }
});

// ========================================
// 🔥 GLOBAL ERROR HANDLER
// ========================================

app.use((err, req, res, next) => {
  const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  console.error(`🔥 Global Error [${errorId}]:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : 'Hidden in production',
    url: req.originalUrl,
    method: req.method,
    headers: req.headers,
    body: req.body,
    timestamp: new Date().toISOString()
  });
  
  // Handle specific error types
  let statusCode = 500;
  let message = 'Internal server error';
  
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid data format';
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate entry';
  } else if (err.message.includes('CORS')) {
    statusCode = 403;
    message = 'CORS policy violation';
  }
  
  const errorResponse = {
    error: message,
    errorId,
    timestamp: new Date().toISOString(),
  };
  
  // Include details in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.details = err.message;
    errorResponse.stack = err.stack;
  }
  
  res.status(statusCode).json(errorResponse);
});

// ========================================
// 💾 MONGODB CONNECTION
// ========================================

const connectDB = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    
    const mongoOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // 10 seconds
      socketTimeoutMS: 45000, // 45 seconds
      maxPoolSize: 10,
      bufferMaxEntries: 0,
      connectTimeoutMS: 10000,
    };
    
    await mongoose.connect(process.env.MONGO_URI, mongoOptions);
    
    console.log('✅ MongoDB connected successfully');
    console.log(`📍 Database: ${mongoose.connection.name}`);
    console.log(`🏠 Host: ${mongoose.connection.host}:${mongoose.connection.port}`);
    
    // Setup connection event listeners
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
    });
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.error('🔍 Connection string format check:', {
      hasProtocol: process.env.MONGO_URI?.startsWith('mongodb'),
      length: process.env.MONGO_URI?.length || 0
    });
    
    // In production, exit on DB failure. In development, continue for API testing
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.log('🔧 Continuing in development mode without database...');
    }
  }
};

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
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🧪 Auth test: http://localhost:${PORT}/auth-test`);
      console.log(`📊 Routes mounted: ${mountedRoutes.length}`);
      console.log('================================\n');
      
      // Log all successfully mounted routes
      if (mountedRoutes.length > 0) {
        console.log('📋 Available API Routes:');
        mountedRoutes.forEach(route => {
          console.log(`   ${route.path} - ${route.description}`);
        });
        console.log('');
      }
    });
    
    // Graceful shutdown handlers
    process.on('SIGTERM', () => {
      console.log('⚠️  SIGTERM received, shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        mongoose.connection.close();
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      console.log('⚠️  SIGINT received, shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
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
  
  // Close server gracefully
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('❌ Stack:', error.stack);
  
  // Close server gracefully
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;