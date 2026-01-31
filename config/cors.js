// config/cors.js
// ========================================
// 🌐 CORS CONFIGURATION
// ========================================

const cors = require('cors');

const getAllowedOrigins = () => {
  const defaultOrigins = [
    'https://aced.live',
    'https://www.aced.live',
    'https://admin.aced.live',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    // PayMe domains
    'https://checkout.paycom.uz',
    'https://checkout.test.paycom.uz',
    // Multicard domains
    'https://checkout.multicard.uz',
    'https://dev-checkout.multicard.uz',
  ];

  // Add development origins
  if (process.env.NODE_ENV === 'development') {
    defaultOrigins.push(
      'http://localhost:5173',
      'http://localhost:4173',
      'http://localhost:8080',
      'http://127.0.0.1:5173'
    );
  }

  // Use environment variable if set
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  }

  return defaultOrigins;
};

const configureCORS = (app) => {
  const allowedOrigins = getAllowedOrigins();

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, PayMe webhooks)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`⚠️  CORS: Blocked origin: ${origin}`);
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
      'X-PayMe-Request',
      'X-Cache-Status',
      'X-Debounced'
    ],
    exposedHeaders: ['X-Total-Count'],
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 200
  }));

  // Handle preflight requests explicitly
  app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,X-Auth,X-Request-Source,X-User-Agent,X-PayMe-Request,X-Cache-Status,X-Debounced');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    res.status(200).end();
  });
};

module.exports = { configureCORS, getAllowedOrigins };