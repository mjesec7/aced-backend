// ✅ Full production-grade server.js for Aced Platform
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

// ✅ Firebase ENV Debug
console.log("🧪 Firebase ENV DEBUG:", {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  keyPreview: process.env.FIREBASE_PRIVATE_KEY?.slice(0, 40),
  endsWith: process.env.FIREBASE_PRIVATE_KEY?.slice(-20),
  hasNewlinesEscaped: process.env.FIREBASE_PRIVATE_KEY?.includes('\\n')
});

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Security & Performance Middleware
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // ✅ fixes Google login popup issue
}));
app.use(compression());

// ✅ Body Parsing
app.use(express.json());

// ✅ CORS Setup
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
app.use(cors({
  origin(origin, callback) {
    console.log('🔍 Checking CORS for origin:', origin);
    if (!origin || allowedOrigins.includes(origin)) {
      console.log('✅ CORS allowed:', origin);
      callback(null, true);
    } else {
      console.warn(`❌ Blocked CORS request from: ${origin}`);
      callback(new Error('CORS Not Allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ✅ Logger
app.use((req, res, next) => {
  console.log(`📥 [${req.method}] ${req.url} from ${req.headers.origin || 'unknown origin'}`);
  next();
});

// ✅ Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// ✅ Firebase Auth Test Route
const authenticateUser = require('./middlewares/authMiddleware');
app.get('/auth-test', authenticateUser, (req, res) => {
  res.json({ message: `✅ Hello ${req.user.email}, you are authorized!`, uid: req.user.uid });
});

// ✅ API Routes
try {
  app.use('/api/lessons', require('./routes/lessonRoutes'));
  app.use('/api/chat', require('./routes/chatRoutes'));
  app.use('/api/user-analytics', require('./routes/userAnalytics'));
  app.use('/api/subjects', require('./routes/subjectRoutes'));
  app.use('/api/payments', require('./routes/paymeRoutes'));
  app.use('/api/users', require('./routes/userRoutes'));
  app.use('/api/email', require('./routes/emailRoutes'));
  app.use('/api/topics', require('./routes/topicRoutes'));
  app.use('/api/user-progress', require('./routes/userProgressRoutes'));
  app.use('/api', require('./routes/recommendationRoutes'));

} catch (routeError) {
  console.error('❌ Failed to load route:', routeError);
}

// ✅ Serve Frontend in SPA Mode
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// 🔁 Catch-all to support Vue Router history mode
app.get('*', (req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }

  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('❌ Failed to send index.html:', err.message);
      res.status(500).send('Something broke!');
    }
  });
});

// ✅ Global Error Handler
app.use((err, req, res, next) => {
  console.error('🔥 Global Error Caught:', err.stack || err.message);
  res.status(500).json({ error: '❌ Unexpected server error occurred.' });
});

// ✅ MongoDB Connection & Launch
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
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
