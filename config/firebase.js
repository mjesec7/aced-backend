const admin = require('firebase-admin');

const {
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
} = process.env;

// ✅ DEBUG LOGGING
console.log("📛 Firebase init debug:", {
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  hasKey: !!FIREBASE_PRIVATE_KEY,
  keyLength: FIREBASE_PRIVATE_KEY?.length,
});

if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error('❌ Missing Firebase environment variables');
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
    console.log('✅ Firebase Admin initialized');
  }
} catch (error) {
  console.error('❌ Firebase Admin init failed:', error.message);
  process.exit(1);
}

module.exports = admin;
