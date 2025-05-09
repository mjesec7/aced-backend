// ✅ Firebase Admin SDK configuration for backend
const admin = require('firebase-admin');

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
  keyPreview: FIREBASE_PRIVATE_KEY?.slice(0, 40),
  endsWith: FIREBASE_PRIVATE_KEY?.slice(-20),
  hasEscapedNewlines: FIREBASE_PRIVATE_KEY?.includes('\\n')
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
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    console.log('✅ Firebase Admin SDK successfully initialized');
  }
} catch (error) {
  console.error('❌ Firebase Admin SDK initialization failed:', error.message);
  process.exit(1);
}

module.exports = admin;