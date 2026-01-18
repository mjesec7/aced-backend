const rateLimit = require('express-rate-limit');

// Whitelisted UIDs (Testers/Admins)
const TEST_UIDS = [
    "a28Z1e2QMhdFcQuPq9MKqq2EQJk2",
    "mBOhHiYsuZb9slbdN37q6GrPMzC2",
    "xtksXAX3qBOxFciimRs67X1gJtI2" // Added from user request
];

const createRateLimiter = (options) => {
    return rateLimit({
        windowMs: options.windowMs || 15 * 60 * 1000, // Default: 15 minutes
        max: options.max || 100, // Default: 100 requests per windowMs
        message: {
            success: false,
            error: 'Too many requests, please try again later.'
        },
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        skip: (req) => {
            // Skip if user is authenticated and whitelisted
            if (req.user && req.user.uid && TEST_UIDS.includes(req.user.uid)) {
                console.log(`🛡️ Rate Limit Skipped for Test User: ${req.user.uid}`);
                return true;
            }
            return false;
        },
        ...options
    });
};

module.exports = createRateLimiter;
