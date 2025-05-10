// ✅ Firebase Admin SDK configuration for backend
const admin = require('firebase-admin');
const express = require('express');
const router = express.Router();

const {
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
} = process.env;

// 🔍 Debug Firebase ENV (safe preview)
console.log("🧪 Firebase Admin ENV:", {
  projectId: FIREBASE_PROJECT_ID,
  clientEmail: FIREBASE_CLIENT_EMAIL,
  keyExists: !!FIREBASE_PRIVATE_KEY,
  keyLength: FIREBASE_PRIVATE_KEY?.length,
  keyPreview: FIREBASE_PRIVATE_KEY?.slice(0, 40),
  endsWith: FIREBASE_PRIVATE_KEY?.slice(-20),
  hasEscapedNewlines: FIREBASE_PRIVATE_KEY?.includes('\\n'),
  charCodes: FIREBASE_PROJECT_ID?.split('').map(c => c.charCodeAt(0))
});

// ❗ Exit if any required env vars are missing
if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error('❌ Missing one or more required Firebase environment variables');
  process.exit(1);
}

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID.trim(),
        clientEmail: FIREBASE_CLIENT_EMAIL.trim(),
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    console.log('✅ Firebase Admin SDK successfully initialized');
  }
} catch (error) {
  console.error('❌ Firebase Admin SDK initialization failed:', error.message);
  if (error.stack) console.error(error.stack);
  process.exit(1);
}

// ✅ Optional Debug Route to Inspect Token
router.get('/debug-token', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    res.json({
      message: '✅ Token is valid',
      uid: decoded.uid,
      email: decoded.email,
      aud: decoded.aud,
      projectId: FIREBASE_PROJECT_ID,
      issuedAt: decoded.iat,
      expiresAt: decoded.exp,
      now: Math.floor(Date.now() / 1000)
    });
  } catch (err) {
    res.status(403).json({
      error: '❌ Token verification failed',
      message: err.message
    });
  }
});

module.exports = admin;
