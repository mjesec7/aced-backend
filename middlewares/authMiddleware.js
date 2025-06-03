// ✅ Firebase Admin SDK initialized via config/firebase.js
const admin = require('../config/firebase');

const authenticateUser = async (req, res, next) => {
  try {
    console.log('🔐 Verifying Firebase token...');
    
    const authHeader = req.headers.authorization;
    console.log('📥 [authMiddleware] Incoming token header:', authHeader);

    // 🔒 Validate Authorization header presence and format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No valid authorization header');
      return res.status(401).json({ 
        success: false, 
        error: 'Authorization header required' 
      });
    }

    // Extract token using substring method for consistency
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    console.log('🔑 Token received, length:', token.length);
    
    if (!token || token.length < 20) {
      console.warn('❌ [authMiddleware] Token too short or missing');
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token format' 
      });
    }

    console.log('🔍 [authMiddleware] Extracted token (preview):', token.slice(0, 40), '...');
    console.log('⏳ [authMiddleware] Verifying token with Firebase Admin SDK...');

    const nowInSeconds = Math.floor(Date.now() / 1000);

    // 🔐 Verify token via Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(token);

    console.log('✅ Token verified for user:', decodedToken.uid);
    console.log('✅ [authMiddleware] Token details:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      email_verified: decodedToken.email_verified,
      exp: decodedToken.exp,
      iat: decodedToken.iat,
      aud: decodedToken.aud,
      iss: decodedToken.iss,
    });

    // Validate project ID if set
    const expectedProjectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
    const tokenAud = (decodedToken.aud || '').trim();

    console.log('[DEBUG] Comparing expected projectId:', expectedProjectId);
    console.log('[DEBUG] Token aud claim:', tokenAud);

    if (expectedProjectId && tokenAud !== expectedProjectId) {
      console.warn(`❌ [authMiddleware] Token aud mismatch. Expected "${expectedProjectId}", got "${tokenAud}"`);
      return res.status(403).json({ 
        success: false, 
        error: 'Token audience mismatch' 
      });
    }

    // Additional expiration check (Firebase SDK usually handles this, but keeping for extra safety)
    if (decodedToken.exp && decodedToken.exp < nowInSeconds) {
      console.warn(`❌ [authMiddleware] Token expired at ${decodedToken.exp}, now is ${nowInSeconds}`);
      return res.status(401).json({ 
        success: false, 
        error: 'Token expired' 
      });
    }

    // ✅ Attach user info for downstream use (enhanced structure)
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      email_verified: decodedToken.email_verified,
      // Include all decoded token data for advanced use cases
      ...decodedToken
    };
    req.firebaseId = decodedToken.uid; // Keep for backward compatibility

    next();

  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    if (error.stack) console.error(error.stack);

    // Enhanced error handling with specific Firebase error codes
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ 
        success: false, 
        error: 'Token expired' 
      });
    } else if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({ 
        success: false, 
        error: 'Token revoked' 
      });
    } else if (error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token format' 
      });
    } else if (error.code === 'auth/project-not-found') {
      return res.status(401).json({ 
        success: false, 
        error: 'Firebase project configuration error' 
      });
    } else {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token' 
      });
    }
  }
};

module.exports = authenticateUser;