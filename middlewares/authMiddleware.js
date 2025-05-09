const admin = require('../config/firebase'); // ✅ Ensure correct import

const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('📥 [authMiddleware] Incoming token:', authHeader);

  // 🔐 Check if token exists and is formatted correctly
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('❌ [authMiddleware] Missing or malformed token');
    return res.status(401).json({ error: 'Unauthorized: Missing or malformed token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);

    console.log('✅ [authMiddleware] Token verified successfully');
    console.log('🔎 UID:', decodedToken.uid);
    console.log('🔐 Claims:', decodedToken);

    // Attach user data to request
    req.user = decodedToken;
    req.firebaseId = decodedToken.uid;

    // ✅ Optional admin enforcement (uncomment if needed)
    // if (!decodedToken.admin) {
    //   console.warn('⚠️ [authMiddleware] Admin privileges required');
    //   return res.status(403).json({ error: 'Forbidden: Admin access required' });
    // }

    next();
  } catch (error) {
    console.error('❌ [authMiddleware] Token verification failed:', error.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

module.exports = authenticateUser;
