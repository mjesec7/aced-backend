require('dotenv').config(); // ✅ Load from .env

module.exports = {
  // 🔐 Secrets
  JWT_SECRET: process.env.JWT_SECRET || 'default_jwt_secret',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  PAYME_SECRET_KEY: process.env.PAYME_SECRET_KEY || '',

  // 🌐 URLs
  FRONTEND_URL: process.env.FRONTEND_URL || 'https://aced.live',

  // 💾 MongoDB / Firebase / Others
  MONGODB_URI: process.env.MONGODB_URI || '',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',

  // 📧 Email (optional)
  MAIL_USER: process.env.MAIL_USER || '',
  MAIL_PASS: process.env.MAIL_PASS || ''
};
