const admin = require('../config/firebase'); // ✅ Ensure correct import

const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('📥 [authMiddleware] Incoming token header:', authHeader);

  // 🔐 Validate header format
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('❌ [authMiddleware] Missing or malformed token header');
    return res.status(401).json({ error: 'Unauthorized: Missing or malformed token' });
  }

  const token = authHeader.split(' ')[1];
  console.log('📥 Extracted token (first 40 chars):', token.slice(0, 40));

  try {
    console.log('⏳ [authMiddleware] Verifying token with Firebase Admin SDK...');
    const decodedToken = await admin.auth().verifyIdToken(token);

    console.log('✅ [authMiddleware] Decoded token:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      exp: decodedToken.exp,
      iat: decodedToken.iat,
      aud: decodedToken.aud,
      iss: decodedToken.iss
    });

    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (decodedToken.exp && decodedToken.exp < nowInSeconds) {
      console.warn(`❌ [authMiddleware] Token expired at ${decodedToken.exp}, current time is ${nowInSeconds}`);
      return res.status(403).json({ error: 'Token has expired' });
    }

    console.log('✅ [authMiddleware] Token is valid and not expired');
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
