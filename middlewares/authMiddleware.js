// ✅ Firebase authentication middleware (enhanced debug + verification)
const admin = require('../config/firebase');

const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('📥 [authMiddleware] Incoming token header:', authHeader);

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

    // ⏱️ Debug server clock
    const nowInSeconds = Math.floor(Date.now() / 1000);
    console.log('[DEBUG] Server time (UTC seconds):', nowInSeconds);

    // 🔐 Decode and verify token
    const decodedToken = await admin.auth().verifyIdToken(token);

    console.log('✅ [authMiddleware] Token verified:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      exp: decodedToken.exp,
      iat: decodedToken.iat,
      aud: decodedToken.aud,
      iss: decodedToken.iss
    });

    // 🎯 Compare expected vs token aud
    console.log('[DEBUG] Firebase projectId from env:', process.env.FIREBASE_PROJECT_ID);
    console.log('[DEBUG] projectId length:', process.env.FIREBASE_PROJECT_ID?.length);
    console.log('[DEBUG] projectId char codes:', process.env.FIREBASE_PROJECT_ID?.split('').map(c => c.charCodeAt(0)));
    console.log('[DEBUG] Token aud claim:', decodedToken.aud);

    if (decodedToken.exp && decodedToken.exp < nowInSeconds) {
      console.warn(`❌ [authMiddleware] Token expired at ${decodedToken.exp}, now is ${nowInSeconds}`);
      return res.status(403).json({ error: 'Token has expired' });
    }

    // ✅ Attach user info
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
