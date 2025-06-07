// ✅ Firebase Admin SDK configuration for backend
const admin = require('firebase-admin');
const express = require('express');
const router = express.Router();

const {
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
} = process.env;

// 🔍 CRITICAL DEBUG - Enhanced Firebase ENV checking
console.log("🧪 ENHANCED Firebase Admin ENV Debug:", {
  projectId: FIREBASE_PROJECT_ID,
  clientEmail: FIREBASE_CLIENT_EMAIL,
  keyExists: !!FIREBASE_PRIVATE_KEY,
  keyLength: FIREBASE_PRIVATE_KEY?.length,
  keyPreview: FIREBASE_PRIVATE_KEY?.slice(0, 50),
  keyEndsWith: FIREBASE_PRIVATE_KEY?.slice(-30),
  hasEscapedNewlines: FIREBASE_PRIVATE_KEY?.includes('\\n'),
  hasRealNewlines: FIREBASE_PRIVATE_KEY?.includes('\n'),
  // CRITICAL: Check if this matches frontend
  expectedProjectId: 'aced-9cf72',
  projectIdMatch: FIREBASE_PROJECT_ID === 'aced-9cf72',
  // Environment info
  nodeEnv: process.env.NODE_ENV,
  server: 'api.aced.live'
});

// ❗ CRITICAL: Exit if any required env vars are missing
if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error('❌ Missing Firebase environment variables:', {
    projectId: !!FIREBASE_PROJECT_ID,
    clientEmail: !!FIREBASE_CLIENT_EMAIL,
    privateKey: !!FIREBASE_PRIVATE_KEY
  });
  console.error('🚨 SERVER CANNOT START WITHOUT FIREBASE CONFIG');
  process.exit(1);
}

// ❗ CRITICAL: Check project ID match
if (FIREBASE_PROJECT_ID !== 'aced-9cf72') {
  console.error('❌ CRITICAL: Firebase project ID mismatch!');
  console.error(`Expected: aced-9cf72`);
  console.error(`Got: ${FIREBASE_PROJECT_ID}`);
  console.error('🚨 This will cause token validation failures!');
  process.exit(1);
}

try {
  if (!admin.apps.length) {
    console.log('🔄 Initializing Firebase Admin SDK...');
    
    // ✅ Enhanced private key processing
    let processedPrivateKey = FIREBASE_PRIVATE_KEY;
    
    // Handle escaped newlines
    if (processedPrivateKey.includes('\\n')) {
      console.log('🔧 Converting escaped newlines to real newlines');
      processedPrivateKey = processedPrivateKey.replace(/\\n/g, '\n');
    }
    
    // Validate private key format
    if (!processedPrivateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      console.error('❌ Invalid private key format - missing header');
      throw new Error('Invalid private key format');
    }
    
    if (!processedPrivateKey.includes('-----END PRIVATE KEY-----')) {
      console.error('❌ Invalid private key format - missing footer');
      throw new Error('Invalid private key format');
    }
    
    const credential = admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID.trim(),
      clientEmail: FIREBASE_CLIENT_EMAIL.trim(),
      privateKey: processedPrivateKey,
    });
    
    admin.initializeApp({
      credential: credential,
      projectId: FIREBASE_PROJECT_ID.trim()
    });
    
    console.log('✅ Firebase Admin SDK successfully initialized');
    console.log(`🔥 Project: ${FIREBASE_PROJECT_ID}`);
    console.log(`📧 Client: ${FIREBASE_CLIENT_EMAIL}`);
    
    // ✅ Test the initialization
    try {
      await admin.auth().listUsers(1);
      console.log('✅ Firebase Admin SDK connection test successful');
    } catch (testError) {
      console.error('❌ Firebase Admin SDK test failed:', testError.message);
      throw testError;
    }
    
  }
} catch (error) {
  console.error('❌ Firebase Admin SDK initialization failed:', error.message);
  console.error('🔍 Error details:', {
    name: error.name,
    code: error.code,
    message: error.message
  });
  
  if (error.stack) console.error('Stack:', error.stack);
  
  // Enhanced error analysis
  if (error.message.includes('private key')) {
    console.error('💡 Solution: Check your FIREBASE_PRIVATE_KEY format');
    console.error('💡 Make sure it includes -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----');
  } else if (error.message.includes('project')) {
    console.error('💡 Solution: Check your FIREBASE_PROJECT_ID');
  } else if (error.message.includes('email')) {
    console.error('💡 Solution: Check your FIREBASE_CLIENT_EMAIL');
  }
  
  console.error('🚨 SERVER CANNOT START WITHOUT FIREBASE');
  process.exit(1);
}

// ✅ Enhanced Debug Route to Inspect Token
router.get('/debug-token', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    console.log('🔍 Debug: Verifying token...');
    const decoded = await admin.auth().verifyIdToken(token);
    
    console.log('✅ Debug: Token verification successful');
    
    res.json({
      message: '✅ Token is valid',
      uid: decoded.uid,
      email: decoded.email,
      aud: decoded.aud,
      iss: decoded.iss,
      projectId: FIREBASE_PROJECT_ID,
      backendProjectId: FIREBASE_PROJECT_ID,
      tokenProjectId: decoded.aud,
      projectMatch: decoded.aud === FIREBASE_PROJECT_ID,
      issuedAt: decoded.iat,
      expiresAt: decoded.exp,
      now: Math.floor(Date.now() / 1000),
      server: 'api.aced.live'
    });
  } catch (err) {
    console.error('❌ Debug: Token verification failed:', err.message);
    res.status(403).json({
      error: '❌ Token verification failed',
      message: err.message,
      code: err.code,
      backendProjectId: FIREBASE_PROJECT_ID,
      server: 'api.aced.live'
    });
  }
});

module.exports = admin;