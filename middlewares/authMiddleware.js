// ✅ Firebase authentication middleware (robust version)
const admin = require('../config/firebase'); // ✅ Ensure correct Firebase Admin import

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

    const decodedToken = await admin.auth().verifyIdToken(token);

    console.log('✅ [authMiddleware] Token verified:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      exp: decodedToken.exp,
      aud: decodedToken.aud,
      iss: decodedToken.iss
    });

    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (decodedToken.exp && decodedToken.exp < nowInSeconds) {
      console.warn(`❌ [authMiddleware] Token expired at ${decodedToken.exp}, now is ${nowInSeconds}`);
      return res.status(403).json({ error: 'Token has expired' });
    }

    // 🔐 Attach decoded data to request
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