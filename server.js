// ========================================
// 🚀 ACED.LIVE - MAIN SERVER FILE (OPTIMIZED)
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

dotenv.config();
mongoose.set('debug', process.env.NODE_ENV === 'development');

const app = express();
const PORT = process.env.PORT || 5000;

// ========================================
// 🛡️ SECURITY & MIDDLEWARE
// ========================================

app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: false,
}));
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ========================================
// 🌐 CORS CONFIGURATION (UPDATED)
// ========================================

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'https://aced.live',
      'https://www.aced.live',
      'https://admin.aced.live',
      'https://api.aced.live',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://checkout.paycom.uz',
      'https://checkout.test.paycom.uz',
      'https://checkout.multicard.uz',
      'https://dev-checkout.multicard.uz',
    ];

if (process.env.NODE_ENV === 'development') {
  allowedOrigins.push('http://localhost:5173', 'http://localhost:4173', 'http://localhost:8080');
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-cache-status'],
  exposedHeaders: ['x-cache-status']
}));

app.options('*', cors()); // Enable pre-flight across-the-board

// ========================================
// 💾 DATABASE CONNECTION
// ========================================

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

connectDB();

// ========================================
// 🏥 HEALTH CHECK
// ========================================

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ========================================
// 📁 FILE UPLOADS
// ========================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadType = req.body.type || 'general';
    const uploadDir = path.join('uploads', uploadType);
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${uuidv4()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  const baseUrl = process.env.NODE_ENV === 'production' ? 'https://api.aced.live' : `${req.protocol}://${req.get('host')}`;
  const fileUrl = `${baseUrl}/uploads/${req.body.type || 'general'}/${req.file.filename}`;
  res.json({ success: true, data: { url: fileUrl, filename: req.file.filename } });
});

app.use('/uploads', express.static('uploads'));

// ========================================
// 📚 MOUNT ALL ROUTES
// ========================================

console.log('🔧 Mounting routes...');

// Helper function to safely mount routes
const mountRoute = (path, routeFile, description) => {
  try {
    const route = require(routeFile);
    app.use(path, route);
    console.log(`✅ ${description || path}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to mount ${path}:`, error.message);
    return false;
  }
};

// ========================================
// CORE ROUTES (CRITICAL - MUST BE FIRST)
// ========================================

// Auth routes (basic endpoints)
mountRoute('/api/auth', './routes/authRoutes', 'Auth routes');

// User routes (CRITICAL)
mountRoute('/api/users', './routes/userRoutes', 'User management routes');
mountRoute('/api/user', './routes/userRoutes', 'User routes (legacy)');

// ========================================
// PAYMENT ROUTES (IMPORTANT ORDER!)
// ========================================

// 1. Multicard routes FIRST (most specific paths)
mountRoute('/api/payments/multicard', './routes/multicardRoutes', 'Multicard payment routes');

// 2. Main payments routes (includes PayMe and general payment logic)
mountRoute('/api/payments', './routes/payments', 'Main payment routes');

// 3. PayMe specific routes (if separate file exists)
try {
  mountRoute('/api/payments', './routes/paymeRoutes', 'PayMe routes');
} catch (e) {
  console.log('⚠️ paymeRoutes not found, using main payments');
}

// 4. Promocode routes
mountRoute('/api/promocodes', './routes/promocodeRoutes', 'Promocode routes');

// ========================================
// PROGRESS & ANALYTICS ROUTES
// ========================================

// User progress routes (CRITICAL)
// This now handles /api/progress, /api/progress/learning-profile, and /api/progress/rewards
mountRoute('/api/progress', './routes/userProgressRoutes', 'User Progress, Learning Profile & Rewards routes');
mountRoute('/api/user-progress', './routes/userProgressRoutes', 'User progress routes (legacy alias)');

// Analytics routes
mountRoute('/api/analytics', './routes/userAnalytics', 'User analytics routes');

// ========================================
// EDUCATIONAL CONTENT ROUTES
// ========================================

// Core educational routes
mountRoute('/api/subjects', './routes/subjectRoutes', 'Subject routes');
mountRoute('/api/topics', './routes/topicRoutes', 'Topic routes');
mountRoute('/api/lessons', './routes/lessonRoutes', 'Lesson routes');

// Vocabulary routes
try {
  mountRoute('/api/vocabulary', './routes/vocabularyRoutes', 'Vocabulary routes');
} catch (e) {
  console.log('⚠️ vocabularyRoutes not found, skipping');
}

// User lesson routes
try {
  mountRoute('/api/user-lessons', './routes/userLessonRoutes', 'User lesson routes');
} catch (e) {
  console.log('⚠️ userLessonRoutes not found, skipping');
}

// Recommendations
try {
  mountRoute('/api/recommendations', './routes/recommendationRoutes', 'Recommendation routes');
} catch (e) {
  console.log('⚠️ recommendationRoutes not found, skipping');
}

// ========================================
// HOMEWORK & TESTS ROUTES
// ========================================

mountRoute('/api/homeworks', './routes/homeworkRoutes', 'Homework routes');
mountRoute('/api/tests', './routes/testRoutes', 'Test routes');

// ========================================
// COMMUNICATION ROUTES
// ========================================

mountRoute('/api/chat', './routes/chatRoutes', 'Chat/AI routes');
mountRoute('/api/email', './routes/emailRoutes', 'Email routes');

// ========================================
// COURSES, GUIDES & BOOKS ROUTES
// ========================================

// Updated Courses (main frontend)
mountRoute('/api/updated-courses', './routes/updatedCourses', 'Updated courses routes');

// Guides & Books
try {
  mountRoute('/api/guides', './routes/guides', 'Guides routes');
} catch (e) {
  console.log('⚠️ guides routes not found, skipping');
}

try {
  mountRoute('/api/books', './routes/books', 'Books routes');
} catch (e) {
  console.log('⚠️ books routes not found, skipping');
}

console.log('✅ All routes mounted successfully\n');

// ========================================
// 🚫 ERROR HANDLERS
// ========================================

// API 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// ========================================
// 🎨 FRONTEND (if exists)
// ========================================

const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.warn('⚠️ No /dist directory found. Static file serving is inactive.');
}

// ========================================
// 🚀 START SERVER
// ========================================

app.listen(PORT, () => {
  console.log('\n🚀 Server started');
  console.log(`   Port: ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Database: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '⚠️ Disconnected'}`);
  console.log('✅ Ready\n');
});

module.exports = app;