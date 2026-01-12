const { admin } = require('../config/firebase');

// ✅ Middleware to verify Firebase token for any logged-in user
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '❌ Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken; // ✅ Make user available in all routes
    next();
  } catch (error) {
    console.error('❌ Token verification error:', error.message);
    return res.status(401).json({ error: '❌ Unauthorized: Invalid or expired token' });
  }
};

// ✅ Optional test route for confirming protection
const protectedRoute = (req, res) => {
  res.json({ message: `✅ Hello ${req.user.email || 'user'}, you are authorized!` });
};

module.exports = {
  verifyToken,
  protectedRoute
};
