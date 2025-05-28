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

// ✅ Debug logger
app.use((req, res, next) => {
  console.log(`📅 [${req.method}] ${req.url} from ${req.headers.origin || 'unknown origin'}`);
  next();
});

// ✅ CORS Configuration (hardcoded for now, use .env later if needed)
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
  res.status(200).json({ status: 'OK' });
});

// ✅ Firebase Auth Test
const authenticateUser = require('./middlewares/authMiddleware');
app.get('/auth-test', authenticateUser, (req, res) => {
  res.json({ message: `✅ Hello ${req.user.email}`, uid: req.user.uid });
});

// ✅ Mount All Routes
try {
  console.log('📦 Mounting /api/users');
  app.use('/api/users', require('./routes/userRoutes'));
  console.log('✅ Mounted /api/users');

  app.use('/api/lessons', require('./routes/lessonRoutes'));
  app.use('/api/chat', require('./routes/chatRoutes'));
  app.use('/api/subjects', require('./routes/subjectRoutes'));
  // app.use('/api/email', require('./routes/emailRoutes'));
  app.use('/api/topics', require('./routes/topicRoutes'));
  app.use('/api/payments', require('./routes/paymeRoutes'));
  app.use('/api/homeworks', require('./routes/homeworkRoutes'));
  app.use('/api/tests', require('./routes/testRoutes'));
  app.use('/api/progress', require('./routes/userProgressRoutes'));
  app.use('/api', require('./routes/recommendationRoutes'));
} catch (routeError) {
  console.error('❌ Failed to load route:', routeError);
}

// ✅ Serve Static Frontend Files (SPA)
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get(/^\/(?!api).*/, (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('❌ index.html failed:', err.message);
      res.status(500).send('Something broke!');
    }
  });
});

// ✅ Global Error Handler
app.use((err, req, res, next) => {
  console.error('🔥 Global Error Caught:', err.stack || err.message);
  res.status(500).json({ error: '❌ Unexpected server error occurred.' });
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
