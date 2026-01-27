require('dotenv').config(); // ✅ MUST BE FIRST - Load env vars before anything else

// ✅ Firebase Admin SDK configuration for backend (CommonJS)
const admin = require('firebase-admin');

const {
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
} = process.env;

// 🔍 DEBUG - Log what we received (without exposing secrets)
console.log('🔍 Firebase ENV check:', {
  projectId: FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing',
  clientEmail: FIREBASE_CLIENT_EMAIL ? '✅ Set' : '❌ Missing',
  privateKey: FIREBASE_PRIVATE_KEY ? `✅ Set (${FIREBASE_PRIVATE_KEY.length} chars)` : '❌ Missing'
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

// ✅ Initialize Firebase Admin SDK (singleton pattern)
let adminApp;

function initializeFirebase() {
  if (adminApp) {
    return adminApp;
  }

  try {
    console.log('🔧 Processing Firebase private key...');
    
    // ✅ Enhanced private key processing
    let processedPrivateKey = FIREBASE_PRIVATE_KEY;
    
    // Remove surrounding quotes if present (single or double)
    if ((processedPrivateKey.startsWith('"') && processedPrivateKey.endsWith('"')) ||
        (processedPrivateKey.startsWith("'") && processedPrivateKey.endsWith("'"))) {
      processedPrivateKey = processedPrivateKey.slice(1, -1);
    }
    
    // Handle double-escaped newlines first (\\n -> \n)
    if (processedPrivateKey.includes('\\\\n')) {
      processedPrivateKey = processedPrivateKey.replace(/\\\\n/g, '\n');
      console.log('  ↳ Converted double-escaped newlines');
    }
    
    // Then handle single-escaped newlines (\n -> actual newline)
    if (processedPrivateKey.includes('\\n')) {
      processedPrivateKey = processedPrivateKey.replace(/\\n/g, '\n');
      console.log('  ↳ Converted single-escaped newlines');
    }
    
    // Validate private key format
    if (!processedPrivateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      console.error('❌ Invalid private key format - missing header');
      console.error('Key start:', processedPrivateKey.slice(0, 50) + '...');
      throw new Error('Invalid private key format - missing header');
    }
    
    if (!processedPrivateKey.includes('-----END PRIVATE KEY-----')) {
      console.error('❌ Invalid private key format - missing footer');
      console.error('Key end:', '...' + processedPrivateKey.slice(-50));
      throw new Error('Invalid private key format - missing footer');
    }
    
    console.log('✅ Private key format validated');
    
    // Create credential
    const credential = admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID.trim(),
      clientEmail: FIREBASE_CLIENT_EMAIL.trim(),
      privateKey: processedPrivateKey,
    });
    
    // Initialize app
    adminApp = admin.initializeApp({
      credential: credential,
      projectId: FIREBASE_PROJECT_ID.trim()
    });

    console.log('✅ Firebase Admin SDK initialized successfully');
    
    return adminApp;
    
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
      console.error('💡 Try using single backslashes (\\n) instead of double (\\\\n) in your .env file');
    } else if (error.message.includes('project')) {
      console.error('💡 Solution: Check your FIREBASE_PROJECT_ID');
    } else if (error.message.includes('email')) {
      console.error('💡 Solution: Check your FIREBASE_CLIENT_EMAIL');
    }
    
    console.error('🚨 SERVER CANNOT START WITHOUT FIREBASE');
    process.exit(1);
  }
}

// Initialize immediately
const firebaseApp = initializeFirebase();

// ✅ Export the admin instance (not the app)
module.exports = admin;