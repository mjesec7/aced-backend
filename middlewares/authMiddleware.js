// ✅ Firebase Admin SDK initialized via config/firebase.js
const admin = require('../config/firebase');

const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('📥 [authMiddleware] Incoming token header:', authHeader);

    // 🔒 Validate Authorization header presence and format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('❌ [authMiddleware] Missing or malformed token header');
      return res.status(401).json({ error: 'Unauthorized: Missing or malformed token' });
    }

    const token = authHeader.split(' ')[1];
    if (!token || token.length < 20) {
      console.warn('❌ [authMiddleware] Token too short or missing');
      return res.status(401).json({ error: 'Unauthorized: Invalid token format' });
    }

    console.log('🔍 [authMiddleware] Extracted token (preview):', token.slice(0, 40), '...');
    console.log('⏳ [authMiddleware] Verifying token with Firebase Admin SDK...');

    // 🕒 Timestamp debug
    const nowInSeconds = Math.floor(Date.now() / 1000);
    console.log('[DEBUG] Server time (UTC seconds):', nowInSeconds);

    // 🔐 Verify token via Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(token);

    // 📄 Token metadata log
    console.log('✅ [authMiddleware] Token verified:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      exp: decodedToken.exp,
      iat: decodedToken.iat,
      aud: decodedToken.aud,
      iss: decodedToken.iss,
    });

    // 🎯 Ensure token matches the correct Firebase project
    const expectedProjectId = process.env.FIREBASE_PROJECT_ID;
    const tokenAud = decodedToken.aud;

    console.log('[DEBUG] Expected projectId:', expectedProjectId);
    console.log('[DEBUG] Token aud claim:', tokenAud);

    if (expectedProjectId && tokenAud !== expectedProjectId) {
      console.warn(`❌ [authMiddleware] Token aud mismatch. Expected ${expectedProjectId}, got ${tokenAud}`);
      return res.status(403).json({ error: 'Token audience mismatch' });
    }

    // ⌛ Check for expiration
    if (decodedToken.exp && decodedToken.exp < nowInSeconds) {
      console.warn(`❌ [authMiddleware] Token expired at ${decodedToken.exp}, now is ${nowInSeconds}`);
      return res.status(403).json({ error: 'Token has expired' });
    }

    // ✅ Attach user info for downstream use
    req.user = decodedToken;
    req.firebaseId = decodedToken.uid;
    next();

  } catch (error) {
    console.error('❌ [authMiddleware] Token verification failed:', error.message);
    if (error.stack) console.error(error.stack);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

module.exports = authenticateUser;
