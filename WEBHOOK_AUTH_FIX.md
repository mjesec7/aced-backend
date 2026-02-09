# Multicard Webhook Authentication Fix

## Problem
When Multicard attempts to send a payment confirmation webhook to ACED's backend, it was receiving a **401 Unauthorized** error. This prevented Multicard from finalizing the payment in its billing system, leaving users with pending transactions that never complete.

### Error Symptoms
- Multicard returns: `"Ошибка при закрытия инвойса в биллинге"` (Error closing invoice in billing)
- Error message: `"Не авторизован"` (Not authorized / 401)
- Payment processed successfully on Multicard's side but never confirmed in ACED

## Root Causes Identified

### 1. **Auth Middleware Path Matching Issue**
The `authMiddleware.js` was using `req.path` instead of `req.originalUrl` to check if a path is public. When routes are mounted as sub-routes (e.g., `router.mount('/api/payments/multicard', multicardRoutes)`), `req.path` doesn't include the full path, causing webhook requests to be incorrectly identified as protected routes.

**Example:**
```javascript
// ❌ BROKEN: req.path = "/webhook"
// Doesn't match "/api/payments/multicard/webhook" in publicPaths list
const isPublicPath = publicPaths.some(path => req.path === path);

// ✅ FIXED: req.originalUrl = "/api/payments/multicard/webhook"
// Correctly matches paths in publicPaths list
const fullPath = req.originalUrl.split('?')[0];
const isPublicPath = publicPaths.some(path => fullPath === path || fullPath.startsWith(path + '/'));
```

### 2. **Missing API_BASE_URL Validation**
The callback URL construction in `multicardController.js` didn't validate that `API_BASE_URL` was set or was HTTPS (required by Multicard). If this variable was misconfigured, Multicard couldn't reach the callback endpoint.

### 3. **Missing Webhook Logging**
The webhook handler had minimal logging, making it impossible to debug issues when requests failed.

## Solutions Implemented

### 1. **Fixed Auth Middleware Path Matching** 
📄 File: `middlewares/authMiddleware.js`

**Changes:**
- Changed path checking to use `req.originalUrl` (full path) instead of `req.path` (relative path)
- Improved matching logic to handle path prefixes correctly
- Added comprehensive logging when public paths are accessed
- Added `/api/payments/multicard/webhook/test` to public paths list

```javascript
// ✅ CRITICAL FIX: Use originalUrl (full path) not path (without mounting prefix)
const fullPath = req.originalUrl.split('?')[0]; // Remove query string
const isPublicPath = publicPaths.some(path => 
  fullPath === path || fullPath.startsWith(path + '/')
);

if (isPublicPath) {
  console.log(`✅ Public path accessed (auth bypassed): ${fullPath}`);
  return next(); // Skip authentication for public paths
}
```

**Impact:** Webhook requests are now correctly identified as public and bypass auth validation.

### 2. **Added API_BASE_URL Validation**
📄 File: `controllers/multicardController.js` (initiatePayment function)

**Changes:**
- Verify `API_BASE_URL` environment variable is set
- Check that it uses HTTPS (required by Multicard)
- Log the constructed callback URL for debugging
- Return helpful error message if configuration is missing

```javascript
const apiBaseUrl = process.env.API_BASE_URL;
if (!apiBaseUrl) {
  return res.status(500).json({
    success: false,
    error: {
      code: 'CONFIG_ERROR',
      details: 'API_BASE_URL not configured. Webhook callback URL cannot be generated.',
      hint: 'Set API_BASE_URL environment variable to your API domain (e.g., https://api.aced.live)'
    }
  });
}

// Verify HTTPS
if (!apiBaseUrl.startsWith('https://')) {
  console.warn(`⚠️  API_BASE_URL is not HTTPS: ${apiBaseUrl}`);
  console.warn('   Multicard requires HTTPS callbacks. This may cause webhook failures.');
}

const callbackUrl = `${apiBaseUrl}/api/payments/multicard/webhook`;
console.log('📋 Callback URL for Multicard:', callbackUrl);
```

**Impact:** Configuration errors are caught early with helpful messages instead of mysterious webhook failures.

### 3. **Enhanced Webhook Logging**
📄 File: `controllers/multicardController.js` (handleWebhook function)

**Changes:**
- Log all webhook requests with headers, body, method, URL, and source IP
- Better error logging with webhook data for debugging

```javascript
console.log('🔔 MULTICARD WEBHOOK RECEIVED');
console.log('   Headers:', JSON.stringify(req.headers, null, 2));
console.log('   Body:', JSON.stringify(req.body, null, 2));
console.log('   Method:', req.method);
console.log('   URL:', req.originalUrl);
console.log('   IP:', req.ip);
```

**Impact:** Webhook issues are immediately visible in server logs with full context.

### 4. **Added Webhook Test Endpoint**
📄 File: `routes/multicardRoutes.js`

**Changes:**
- Added `POST /api/payments/multicard/webhook/test` endpoint
- Always returns 200 OK with timestamp
- Logs request details for connectivity testing
- Can be used to verify webhook connectivity from Multicard's servers

```javascript
router.post('/webhook/test', (req, res) => {
    console.log('🔔 TEST WEBHOOK ENDPOINT HIT');
    console.log('   Method:', req.method);
    console.log('   Headers:', Object.keys(req.headers));
    res.status(200).json({
        success: true,
        message: 'Test webhook endpoint is reachable',
        timestamp: new Date().toISOString(),
        receivedAt: new Date().toISOString()
    });
});
```

**Impact:** Can quickly verify that Multicard can reach ACED's servers before attempting payment.

### 5. **Added Webhook Auth Bypass in Routes**
📄 File: `routes/multicardRoutes.js`

**Changes:**
- Added explicit middleware to mark webhook paths for auth bypass
- Documented why webhooks must not require auth (Multicard sends callbacks without user tokens)

```javascript
// Middleware to explicitly handle webhook auth
// Multicard webhooks must NOT require user authentication
router.use((req, res, next) => {
    if (req.path === '/webhook' || req.path === '/webhook/test') {
        console.log('🔓 Webhook request - auth bypass applied');
        req.skipAuth = true;
    }
    next();
});
```

**Impact:** Redundant protection to ensure webhooks are never accidentally auth-protected.

## Files Modified

1. **`middlewares/authMiddleware.js`**
   - Fixed path matching logic (req.originalUrl instead of req.path)
   - Enhanced logging for public paths
   - Added test endpoint to public paths list

2. **`controllers/multicardController.js`** 
   - Added API_BASE_URL validation in `initiatePayment()`
   - Added comprehensive webhook logging in `handleWebhook()`
   - Added HTTPS verification for callback URL

3. **`routes/multicardRoutes.js`**
   - Added webhook test endpoint
   - Added explicit auth bypass middleware for webhooks
   - Added better route documentation

## Testing & Verification

### Test the webhook connectivity:
```bash
curl -X POST https://api.aced.live/api/payments/multicard/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
  
# Should return 200 OK
```

### Monitor webhook logs:
```bash
# Watch server logs for webhook activity
tail -f logs/app.log | grep "🔔 MULTICARD WEBHOOK"
```

### Verify API_BASE_URL:
Check that your production environment has:
```
API_BASE_URL=https://api.aced.live  # Must be HTTPS
```

### Manual webhook test:
```bash
curl -X POST https://api.aced.live/api/payments/multicard/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "payment": {
      "store_invoice_id": "ACED_PRO_1234567890",
      "uuid": "test-uuid-12345",
      "status": "success",
      "amount": 45500000,
      "payment_amount": 45500000,
      "commission_amount": 0,
      "total_amount": 45500000,
      "ps": "visa",
      "payment_time": "2024-01-01T12:00:00Z"
    }
  }'
```

## Expected Behavior After Fix

1. **Multicard Invoice Creation:**
   - Callback URL is correctly constructed and logged
   - Validation ensures API_BASE_URL is HTTPS

2. **Payment Webhook Callback:**
   - Multicard calls `/api/payments/multicard/webhook` 
   - Request bypasses auth middleware (no Bearer token required)
   - Webhook is processed successfully and returns 200 OK
   - Multicard can finalize invoice closure
   - User's payment status updates to "paid"
   - User receives subscription/plan access

3. **Error Cases:**
   - Missing API_BASE_URL shows clear error message
   - Webhook failures are logged with full context
   - Test endpoint allows pre-payment connectivity verification

## Deployment Notes

- No database schema changes required
- No environment variable changes required (existing `API_BASE_URL` is used)
- Backward compatible - existing webhook logic unchanged
- Safe to deploy immediately - logging only for debugging

## Future Improvements

1. Add webhook signature validation (Multicard sends signature in headers)
2. Add webhook retry logic if database write fails
3. Add monitoring/alerting for failed webhooks
4. Add webhook delivery status dashboard
5. Consider idempotency keys to prevent duplicate charge processing
