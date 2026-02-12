// middlewares/authMiddleware.js
// ✅ Firebase Admin SDK initialized via config/firebase.js
const admin = require('../config/firebase');

const authenticateUser = async (req, res, next) => {
  try {
    // ✅ PUBLIC PATHS - Skip authentication for webhooks and callbacks
    // These endpoints are called by external services (Multicard, PayMe) without user tokens
    const publicPaths = [
      '/api/payments/multicard/webhook',
      '/api/payments/multicard/callback',
      '/api/payments/multicard/callback/success',
      '/api/payments/multicard/return/success',
      '/api/payments/multicard/return/error',
      '/api/payments/multicard/webhook/test', // ✅ NEW: Debug test endpoint
      '/api/payments/payme',
      '/api/payments/payme/notify',
      '/api/payments/payme/return/success',
      '/api/payments/payme/return/failure',
      '/api/payments/payme/return/cancel',
      '/health',
      '/api/health',
      '/api/status',
      '/api/routes'
    ];

    // ✅ CRITICAL FIX: Use originalUrl (full path) not path (without mounting prefix)
    // This ensures webhook paths are correctly identified even when mounted as sub-routes
    const fullPath = req.originalUrl.split('?')[0]; // Remove query string
    const isPublicPath = publicPaths.some(path => 
      fullPath === path || fullPath.startsWith(path + '/')
    );
    
    if (isPublicPath) {
      console.log(`✅ Public path accessed (auth bypassed): ${fullPath}`);
      return next(); // Skip authentication for public paths
    }

    const authHeader = req.headers.authorization;

    // 🔒 Validate Authorization header presence and format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('⚠️ Missing or invalid auth header. Header:', authHeader ? 'EXISTS' : 'MISSING');
      return res.status(401).json({ 
        success: false, 
        error: 'Authorization header required' 
      });
    }

    // Extract token using substring method for consistency
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    console.log('🔑 Token received, length:', token.length);
    console.log('🔑 Token preview:', token.slice(0, 50) + '...');
    
    if (!token || token.length < 20) {
      console.warn('⚠️ Token too short:', token.length);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token format' 
      });
    }

    // 🔐 Verify token via Firebase Admin with enhanced error handling
    let decodedToken;
    try {
      console.log('🔐 Verifying token with Firebase...');
      decodedToken = await admin.auth().verifyIdToken(token);
      console.log('✅ Token verified successfully. UID:', decodedToken.uid);
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

    // ✅ CRITICAL: Force validate project ID match
    const REQUIRED_PROJECT_ID = 'aced-9cf72'; // Your frontend project ID
    const tokenAud = (decodedToken.aud || '').trim();
    const envProjectId = (process.env.FIREBASE_PROJECT_ID || '').trim();

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

/**
 * 🔒 ADMIN VERIFICATION MIDDLEWARE
 * Use AFTER verifyToken to ensure the user has admin privileges.
 * This checks the user's role in the database.
 */
const verifyAdmin = async (req, res, next) => {
  try {
    // Ensure user is authenticated first
    if (!req.user || !req.user.uid) {
      console.warn('⚠️ verifyAdmin: No user authenticated');
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    console.log('🔍 verifyAdmin checking for UID:', req.user.uid);

    // Import User model here to avoid circular dependencies
    const User = require('../models/user');
    
    // Check user's role in database
    const user = await User.findOne({ firebaseId: req.user.uid }).select('role firebaseId email');
    
    console.log('📋 User found in DB:', user ? 'YES' : 'NO');
    if (user) {
      console.log('👤 User details - Email:', user.email, 'Role:', user.role);
    } else {
      console.warn('⚠️ User not found in database for UID:', req.user.uid);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    console.log('🔐 Checking admin role:', user.role, '(should be "admin")');

    if (user.role !== 'admin') {
      console.warn('❌ User is not admin. Role:', user.role);
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
        userRole: user.role
      });
    }

    // User is admin, proceed
    console.log('✅ Admin verification passed for user:', user.email);
    req.isAdmin = true;
    next();

  } catch (error) {
    console.error('❌ Admin verification failed:', error.message);
    console.error('📍 Stack:', error.stack);
    return res.status(500).json({
      success: false,
      error: 'Admin verification failed',
      details: error.message
    });
  }
};
        message: 'You do not have permission to perform this action'
      });
    }

    // User is admin, proceed
    req.isAdmin = true;
    next();

  } catch (error) {
    console.error('❌ Admin verification failed:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Admin verification failed'
    });
  }
};

// Export both middlewares
module.exports = authenticateUser;
module.exports.verifyToken = authenticateUser;
module.exports.verifyAdmin = verifyAdmin;