const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

console.log("🧪 Firebase ENV DEBUG:", {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  keyPreview: process.env.FIREBASE_PRIVATE_KEY?.slice(0, 40),
  endsWith: process.env.FIREBASE_PRIVATE_KEY?.slice(-20),
  hasNewlinesEscaped: process.env.FIREBASE_PRIVATE_KEY?.includes('\\n')
});

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Security & Performance Middlewares
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
app.use(compression());
app.use(express.json());

// ✅ Debug logger with more details
app.use((req, res, next) => {
  console.log(`📅 [${req.method}] ${req.url} from ${req.headers.origin || 'unknown origin'}`);
  if (req.method === 'POST' && req.url.includes('/progress')) {
    console.log('📦 Progress request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// ✅ CORS Configuration
const allowedOrigins = [
  'https://aced.live',
  'https://admin.aced.live',
  'http://localhost:3000',
];

app.use(cors({
  origin: (origin, callback) => {
    console.log('🔍 Checking CORS for:', origin);
    if (!origin || allowedOrigins.includes(origin)) {
      console.log('✅ CORS allowed:', origin);
      callback(null, true);
    } else {
      console.warn('❌ CORS blocked:', origin);
      callback(new Error('CORS Not Allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ✅ Allow all OPTIONS preflight requests globally
app.options('*', cors());

// ✅ Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    routes: {
      progress: 'mounted',
      users: 'mounted',
      lessons: 'mounted'
    }
  });
});

// ✅ Firebase Auth Test
const authenticateUser = require('./middlewares/authMiddleware');
app.get('/auth-test', authenticateUser, (req, res) => {
  res.json({ message: `✅ Hello ${req.user.email}`, uid: req.user.uid });
});

// ✅ Mount All Routes with Enhanced Error Handling
try {
  console.log('📦 Mounting all routes...');
  
  // Progress routes - CRITICAL: Mount BEFORE user routes to avoid conflicts
  console.log('📈 Mounting progress routes...');
  app.use('/api/progress', require('./routes/progressRoutes'));
  console.log('✅ Mounted /api/progress');

  // User routes
  console.log('👤 Mounting user routes...');
  app.use('/api/users', require('./routes/userRoutes'));
  console.log('✅ Mounted /api/users');

  // User-specific routes (for legacy /api/user/:id/lesson/:id endpoint)
  console.log('👤 Mounting user lesson routes...');
  app.use('/api/user', require('./routes/userLessonRoutes'));
  console.log('✅ Mounted /api/user');

  // Lesson routes
  console.log('📚 Mounting lesson routes...');
  app.use('/api/lessons', require('./routes/lessonRoutes'));
  console.log('✅ Mounted /api/lessons');

  // Chat routes
  console.log('💬 Mounting chat routes...');
  app.use('/api/chat', require('./routes/chatRoutes'));
  console.log('✅ Mounted /api/chat');

  // Subject routes
  console.log('📖 Mounting subject routes...');
  app.use('/api/subjects', require('./routes/subjectRoutes'));
  console.log('✅ Mounted /api/subjects');

  // Topic routes
  console.log('🏷️ Mounting topic routes...');
  app.use('/api/topics', require('./routes/topicRoutes'));
  console.log('✅ Mounted /api/topics');

  // Payment routes
  console.log('💳 Mounting payment routes...');
  app.use('/api/payments', require('./routes/paymeRoutes'));
  console.log('✅ Mounted /api/payments');

  // Homework routes
  console.log('📝 Mounting homework routes...');
  app.use('/api/homeworks', require('./routes/homeworkRoutes'));
  console.log('✅ Mounted /api/homeworks');

  // Test routes
  console.log('🧪 Mounting test routes...');
  app.use('/api/tests', require('./routes/testRoutes'));
  console.log('✅ Mounted /api/tests');

  // Analytics routes
  console.log('📊 Mounting analytics routes...');
  app.use('/api/analytics', require('./routes/userAnalytics'));
  console.log('✅ Mounted /api/analytics');

  // Recommendation routes (mounted at /api level)
  console.log('💡 Mounting recommendation routes...');
  app.use('/api', require('./routes/recommendationRoutes'));
  console.log('✅ Mounted /api recommendations');

  // Email routes (uncomment if needed)
  // app.use('/api/email', require('./routes/emailRoutes'));
  
} catch (routeError) {
  console.error('❌ Failed to load route:', routeError);
  console.error('Stack trace:', routeError.stack);
}

// ✅ Route debugging middleware
app.use('/api/*', (req, res, next) => {
  console.log(`🔍 API Route attempt: ${req.method} ${req.originalUrl}`);
  console.log('📊 Available routes check:', {
    progressPost: 'Should work',
    progressGet: 'Should work',
    userDiary: 'Should work'
  });
  next();
});

// ✅ 404 Handler for API routes
app.use('/api/*', (req, res) => {
  console.error(`❌ API route not found: ${req.originalUrl}`);
  console.error(`❌ Method: ${req.method}`);
  console.error(`❌ Headers:`, req.headers);
  
  res.status(404).json({ 
    error: '❌ API endpoint not found',
    path: req.originalUrl,
    method: req.method,
    suggestion: 'Check if the route is mounted correctly in server.js'
  });
});

// ✅ Serve Static Frontend Files (SPA)
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Catch-all route for SPA (must be last)
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('❌ index.html failed:', err.message);
      res.status(500).send('Something broke!');
    }
  });
});

// ✅ Global Error Handler with enhanced logging
app.use((err, req, res, next) => {
  console.error('🔥 Global Error Caught:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body
  });
  
  res.status(500).json({ 
    error: '❌ Unexpected server error occurred.',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log('✅ MongoDB connected');
    
    // Log all mounted routes for debugging
    console.log('📋 All mounted routes:');
    app._router.stack.forEach((middleware) => {
      if (middleware.route) {
        console.log(`  ${Object.keys(middleware.route.methods)} ${middleware.route.path}`);
      } else if (middleware.name === 'router') {
        console.log(`  Router: ${middleware.regexp}`);
      }
    });
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  });

// ✅ Crash Protection
process.on('unhandledRejection', (err) => {
  console.error('⚠️ Unhandled Rejection:', err);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});