// ✅ Firebase Admin SDK initialized via config/firebase.js
const admin = require('../config/firebase');

const authenticateUser = async (req, res, next) => {
  try {
    console.log('🔐 Verifying Firebase token on api.aced.live...');
    
    const authHeader = req.headers.authorization;
    console.log('📥 [authMiddleware] Incoming token header:', authHeader ? 'Present' : 'Missing');

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

    // 🔐 Verify token via Firebase Admin with enhanced error handling
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
      console.log('✅ Token verified for user:', decodedToken.uid);
    } catch (verificationError) {
      console.error('❌ Token verification failed:', {
        error: verificationError.message,
        code: verificationError.code,
        backendProjectId: process.env.FIREBASE_PROJECT_ID,
        expectedProjectId: 'aced-9cf72'
      });
      
      // Specific error handling
      if (verificationError.code === 'auth/project-not-found') {
        return res.status(401).json({ 
          success: false, 
          error: 'Firebase project configuration mismatch',
          details: 'Backend project ID does not match frontend'
        });
      }
      
      if (verificationError.code === 'auth/argument-error') {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid Firebase configuration',
          details: 'Check Firebase private key and project settings'
        });
      }
      
      throw verificationError;
    }

    console.log('✅ [authMiddleware] Token details:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      email_verified: decodedToken.email_verified,
      exp: decodedToken.exp,
      iat: decodedToken.iat,
      aud: decodedToken.aud,
      iss: decodedToken.iss,
    });

    // ✅ CRITICAL: Force validate project ID match
    const REQUIRED_PROJECT_ID = 'aced-9cf72'; // Your frontend project ID
    const tokenAud = (decodedToken.aud || '').trim();
    const envProjectId = (process.env.FIREBASE_PROJECT_ID || '').trim();

    console.log('[CRITICAL] Project ID validation:', {
      requiredProjectId: REQUIRED_PROJECT_ID,
      tokenAud: tokenAud,
      envProjectId: envProjectId,
      tokenMatches: tokenAud === REQUIRED_PROJECT_ID,
      envMatches: envProjectId === REQUIRED_PROJECT_ID
    });

    // Check if token is from correct project
    if (tokenAud !== REQUIRED_PROJECT_ID) {
      console.error(`❌ [CRITICAL] Token from wrong project. Expected "${REQUIRED_PROJECT_ID}", got "${tokenAud}"`);
      return res.status(403).json({ 
        success: false, 
        error: 'Token from incorrect Firebase project',
        expected: REQUIRED_PROJECT_ID,
        received: tokenAud
      });
    }

    // Check if backend is configured for correct project
    if (envProjectId !== REQUIRED_PROJECT_ID) {
      console.error(`❌ [CRITICAL] Backend misconfigured. FIREBASE_PROJECT_ID should be "${REQUIRED_PROJECT_ID}", got "${envProjectId}"`);
      return res.status(500).json({ 
        success: false, 
        error: 'Backend Firebase project misconfiguration',
        details: `Backend should be configured for project: ${REQUIRED_PROJECT_ID}`
      });
    }

    // Additional expiration check
    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (decodedToken.exp && decodedToken.exp < nowInSeconds) {
      console.warn(`❌ [authMiddleware] Token expired at ${decodedToken.exp}, now is ${nowInSeconds}`);
      return res.status(401).json({ 
        success: false, 
        error: 'Token expired' 
      });
    }

    // ✅ Attach user info for downstream use
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      email_verified: decodedToken.email_verified,
      projectId: decodedToken.aud,
      // Include all decoded token data for advanced use cases
      ...decodedToken
    };
    req.firebaseId = decodedToken.uid; // Keep for backward compatibility

    console.log('✅ Authentication successful for:', decodedToken.email);
    next();

  } catch (error) {
    console.error('❌ Token verification failed:', {
      message: error.message,
      code: error.code,
      name: error.name
    });

    // Enhanced error handling with specific Firebase error codes
    let errorResponse = { success: false, error: 'Authentication failed' };
    
    if (error.code === 'auth/id-token-expired') {
      errorResponse.error = 'Token expired';
    } else if (error.code === 'auth/id-token-revoked') {
      errorResponse.error = 'Token revoked';
    } else if (error.code === 'auth/invalid-id-token') {
      errorResponse.error = 'Invalid token format';
    } else if (error.code === 'auth/project-not-found') {
      errorResponse.error = 'Firebase project configuration error';
      errorResponse.details = 'Check FIREBASE_PROJECT_ID environment variable';
    } else if (error.code === 'auth/argument-error') {
      errorResponse.error = 'Firebase configuration error';
      errorResponse.details = 'Invalid Firebase credentials or private key';
    } else {
      errorResponse.error = 'Invalid Firebase token';
    }

    return res.status(401).json(errorResponse);
  }
};

module.exports = authenticateUser;