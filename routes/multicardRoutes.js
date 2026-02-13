const express = require('express');
const router = express.Router();
const axios = require('axios');
const multicardController = require('../controllers/multicardController');
const { getAuthToken } = require('../controllers/multicardAuth');
const MulticardTransaction = require('../models/MulticardTransaction');
const verifyToken = require('../middlewares/authMiddleware');
const {
    setVariable,
    getVariable,
    getAllVariables,
    clearVariables,
    deleteVariable
} = require('../controllers/multicardController');

// ============================================
// 🔧 CORS CONFIGURATION FOR MULTICARD ROUTES
// ============================================

// Handle CORS preflight for all routes
router.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    res.sendStatus(200);
});

// ============================================
// ✅ AUTH BYPASS FOR WEBHOOKS
// ============================================
// Middleware to explicitly handle webhook auth
// Multicard webhooks must NOT require user authentication
router.use((req, res, next) => {
    // ✅ CRITICAL: Do not validate auth for webhook endpoints
    // Multicard's server sends callbacks without user tokens
    if (req.path === '/webhook' || req.path === '/webhook/test') {
        console.log('🔓 Webhook request - auth bypass applied');
        // Skip any auth middleware for webhooks
        req.skipAuth = true;
    }
    next();
});

// Middleware for all multicard requests
router.use((req, res, next) => {
    next();
});

// ============================================
// ✅ CRITICAL WEBHOOK ENDPOINTS (MUST BE FIRST)
// ============================================
// These must be before any catch-all routes and debug routes
// IMPORTANT: Register both with and without trailing slash to prevent 301 redirects
// Multicard may send callbacks to either /webhook or /webhook/

// Webhooks - unified handler (SHA1 for status webhooks, MD5 for success callbacks)
router.post('/webhook', multicardController.handleWebhook);
router.post('/webhook/', multicardController.handleWebhook);

// Allow GET /webhook for connectivity checks or browser testing
router.get('/webhook', (req, res) => res.status(200).json({ success: true, message: 'Webhook endpoint is reachable' }));
router.get('/webhook/', (req, res) => res.status(200).json({ success: true, message: 'Webhook endpoint is reachable' }));

// Success callback (old format, MD5) - also register with trailing slash
router.post('/success', multicardController.handleSuccessCallbackOld);
router.post('/success/', multicardController.handleSuccessCallbackOld);

// Webhook debug endpoint - returns 200 for any request (helps test connectivity)
router.post('/webhook/test', (req, res) => {
    console.log('🔔 TEST WEBHOOK ENDPOINT HIT');
    console.log('   Method:', req.method);
    console.log('   Headers:', Object.keys(req.headers));
    console.log('   Auth header present:', !!req.headers.authorization);
    res.status(200).json({
        success: true,
        message: 'Test webhook endpoint is reachable',
        timestamp: new Date().toISOString(),
        receivedAt: new Date().toISOString()
    });
});

// ============================================
// 💳 USER PAYMENT HISTORY (AUTHENTICATED)
// ============================================

/**
 * Get current user's payment transactions
 * Also syncs pending transaction statuses with Multicard API
 */
router.get('/my-transactions', verifyToken, async (req, res) => {
    try {
        const firebaseId = req.user?.uid || req.user?.firebaseId;
        if (!firebaseId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const User = require('../models/user');
        const { getDurationFromAmount } = require('../config/subscriptionConfig');
        const user = await User.findOne({ firebaseId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Fetch all transactions for this user
        const transactions = await MulticardTransaction.find({
            $or: [
                { userId: user._id },
                { firebaseUserId: firebaseId }
            ],
            transactionType: { $ne: 'card_binding' }
        })
            .sort({ createdAt: -1 })
            .limit(50);

        // Background sync: check pending transactions with Multicard API
        const pendingTxs = transactions.filter(tx => tx.status === 'pending' && tx.multicardUuid);
        if (pendingTxs.length > 0) {
            try {
                const token = await getAuthToken();
                const API_URL = process.env.MULTICARD_API_URL || 'https://api.multicard.uz/api/v1';

                for (const tx of pendingTxs.slice(0, 10)) {
                    try {
                        const resp = await axios.get(
                            `${API_URL}/payment/invoice/${tx.multicardUuid}`,
                            { headers: { 'Authorization': `Bearer ${token}` }, timeout: 5000 }
                        );
                        const pd = resp.data?.data?.payment;
                        console.log(`🔄 Sync tx ${tx.invoiceId}: MC status=${pd?.status}, our status=${tx.status}`);

                        if (pd?.status === 'success' && tx.status !== 'paid') {
                            tx.status = 'paid';
                            tx.paidAt = new Date(pd.payment_time || Date.now());
                            if (pd.card_pan) tx.cardPan = pd.card_pan;
                            if (pd.ps) tx.ps = pd.ps;
                            await tx.save();

                            // Always grant subscription for newly-paid transactions
                            // grantSubscription() handles extending existing subscriptions
                            const { durationDays, durationMonths } = getDurationFromAmount(tx.amount);
                            console.log(`💳 Granting subscription: amount=${tx.amount} tiyin → ${durationDays} days`);
                            await user.grantSubscription(tx.plan || 'pro', durationDays, 'multicard', durationMonths);
                            user.subscriptionAmount = tx.amount;
                            user.lastPaymentDate = new Date();
                            await user.save();
                            console.log(`✅ Subscription granted: plan=${user.subscriptionPlan}, expires=${user.subscriptionExpiryDate}`);
                        } else if (pd?.status === 'error') {
                            tx.status = 'failed';
                            await tx.save();
                        } else if (pd?.status === 'revert') {
                            tx.status = 'refunded';
                            await tx.save();
                        }
                    } catch (e) {
                        console.error(`⚠️ Sync failed for ${tx.invoiceId}: ${e.message}`);
                    }
                }
            } catch (e) {
                console.error('Sync error:', e.message);
            }
        }

        const formattedTransactions = transactions.map(tx => ({
            id: tx._id,
            invoiceId: tx.invoiceId,
            amount: tx.amount ? Math.round(tx.amount / 100) : 0,
            plan: tx.plan || 'pro',
            status: tx.status,
            cardPan: tx.cardPan || null,
            paymentSystem: tx.ps || null,
            receiptUrl: tx.paymentDetails?.receiptUrl || null,
            paidAt: tx.paidAt || null,
            createdAt: tx.createdAt
        }));

        res.json({
            success: true,
            count: formattedTransactions.length,
            transactions: formattedTransactions
        });
    } catch (error) {
        console.error('❌ Error fetching user transactions:', error.message);
        res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
    }
});

// ============================================
// DEBUG / TEST ROUTES (Place these first)
// ============================================

/**
 * List all transactions (for debugging)
 */
router.get('/debug/transactions', async (req, res) => {
    try {
        const transactions = await MulticardTransaction.find()
            .sort({ createdAt: -1 })
            .limit(20)
            .select('invoiceId multicardUuid status amount plan createdAt checkoutUrl');

        res.json({
            success: true,
            count: transactions.length,
            data: transactions
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get single transaction by any identifier
 */
router.get('/debug/transaction/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params;

        const transaction = await MulticardTransaction.findOne({
            $or: [
                { invoiceId: identifier },
                { multicardUuid: identifier }
            ]
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found',
                searched: identifier
            });
        }

        res.json({
            success: true,
            data: transaction
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Test Multicard API directly with a UUID
 */
router.get('/debug/multicard/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        const token = await getAuthToken();

        const response = await axios.get(
            `${process.env.MULTICARD_API_URL}/payment/invoice/${uuid}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Access-Token': process.env.MULTICARD_TOKEN || '',
                    'Accept': 'application/json'
                }
            }
        );

        res.json({
            success: true,
            status: response.status,
            data: response.data
        });

    } catch (error) {
        console.error(`❌ Multicard API Error:`);
        console.error(`   Status: ${error.response?.status}`);
        console.error(`   Message: ${error.message}`);
        console.error(`   Response:`, JSON.stringify(error.response?.data, null, 2));

        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data
            }
        });
    }
});

/**
 * Test auth token
 */
router.get('/debug/auth', async (req, res) => {
    try {
        const token = await getAuthToken();

        res.json({
            success: true,
            message: 'Auth token obtained',
            tokenPreview: token.substring(0, 30) + '...',
            tokenLength: token.length,
            apiUrl: process.env.MULTICARD_API_URL,
            storeId: process.env.MULTICARD_STORE_ID
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Check environment variables
 */
router.get('/debug/env', (req, res) => {
    res.json({
        success: true,
        env: {
            MULTICARD_API_URL: process.env.MULTICARD_API_URL || 'NOT SET',
            MULTICARD_APPLICATION_ID: process.env.MULTICARD_APPLICATION_ID || 'NOT SET',
            MULTICARD_SECRET: process.env.MULTICARD_SECRET ? 'SET (***' + process.env.MULTICARD_SECRET.slice(-4) + ')' : 'NOT SET',
            MULTICARD_STORE_ID: process.env.MULTICARD_STORE_ID || 'NOT SET',
            MULTICARD_TOKEN: process.env.MULTICARD_TOKEN ? 'SET (***' + process.env.MULTICARD_TOKEN.slice(-4) + ')' : 'NOT SET',
            API_BASE_URL: process.env.API_BASE_URL || 'NOT SET',
            FRONTEND_URL: process.env.FRONTEND_URL || 'NOT SET'
        }
    });
});

/**
 * List all registered routes
 */
router.get('/debug/routes', (req, res) => {
    const routes = [];

    router.stack.forEach(layer => {
        if (layer.route) {
            const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
            routes.push({
                path: layer.route.path,
                methods: methods
            });
        }
    });

    res.json({
        success: true,
        message: 'Multicard routes registered',
        count: routes.length,
        routes: routes.sort((a, b) => a.path.localeCompare(b.path))
    });
});

// ============================================
// PAYMENT ROUTES
// ============================================

// ✅ CRITICAL: Handle GET method with clear error
router.get('/initiate', (req, res) => {
    console.warn('⚠️  Received GET request to /initiate - This endpoint requires POST!');

    res.status(405).json({
        success: false,
        error: {
            code: 'METHOD_NOT_ALLOWED',
            message: 'This endpoint requires POST method',
            details: 'You sent a GET request, but /initiate only accepts POST',
            correctUsage: {
                method: 'POST',
                url: '/api/payments/multicard/initiate',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer YOUR_TOKEN'
                },
                body: {
                    userId: 'string',
                    plan: 'start or pro',
                    amount: 'number (optional)',
                    lang: 'ru, uz, or en (optional)'
                }
            }
        }
    });
});

// ✅ CRITICAL: The actual POST handler
router.post('/initiate', multicardController.initiatePayment);

// QR code payment (PaymeGo, ClickPass, Uzum, etc.)
router.put('/payment/:uuid/scanpay', multicardController.processScanPay);

// Success callback moved to top of file (with trailing slash support)

// User return callbacks
router.get('/return/success', multicardController.handleSuccessCallback);
router.get('/return/error', (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL}/payment-failed`);
});

// Invoice management
router.get('/invoice/:invoiceId', multicardController.getInvoiceInfo);
router.delete('/invoice/:uuid', multicardController.deleteInvoice);

// ============================================
// CARD BINDING ROUTES (Form-based)
// ============================================

// Create card binding session
router.post('/card/bind', multicardController.createCardBindingSession);

// Card binding callback (from Multicard)
router.post('/card-binding/callback', multicardController.handleCardBindingCallback);
router.post('/card/bind/callback', multicardController.handleCardBindingCallback);

// Check card binding status
router.get('/card/bind/:sessionId', multicardController.checkCardBindingStatus);
router.get('/card-binding/status/:sessionId', multicardController.checkCardBindingStatus);

// Get card info by token
router.get('/card/:cardToken', multicardController.getCardInfoByToken);

// Check PINFL (Uzcard/Humo only)
router.post('/card/check-pinfl', multicardController.checkCardPinfl);

// Delete card token
router.delete('/card/:cardToken', multicardController.deleteCardToken);

// ============================================
// CARD BINDING ROUTES (API-based - requires PCI DSS)
// ============================================

// Add card by card details (sends SMS OTP)
router.post('/card', multicardController.addCardByDetails);

// Confirm card binding with OTP
router.put('/card/:cardToken/confirm', multicardController.confirmCardBinding);

// Check card by PAN
router.get('/card/check/:pan', multicardController.checkCardByPan);

// ============================================
// PAYMENT BY CARD TOKEN ROUTES
// ============================================

// Create payment by saved card token
router.post('/payment', multicardController.createPaymentByToken);

// Create payment by card details (PCI DSS required)
router.post('/payment/by-card', multicardController.createPaymentByCardDetails);

// Create split payment
router.post('/payment/split', multicardController.createSplitPayment);

// Create payment via payment app (Payme, Click, Uzum, etc.)
router.post('/payment/via-app', multicardController.createPaymentViaApp);

// Confirm payment with OTP
router.put('/payment/:paymentUuid', multicardController.confirmPayment);

// Send fiscal receipt URL
router.patch('/payment/:paymentUuid/fiscal', multicardController.sendFiscalReceipt);

// Refund payment
router.delete('/payment/:paymentUuid', multicardController.refundPayment);

// Get payment info
router.get('/payment/:paymentUuid', multicardController.getPaymentInfo);

// ============================================
// UTILITY / ADMIN ROUTES
// ============================================

// Test connection
router.get('/test-connection', multicardController.testConnection);

// Get application information
router.get('/application/info', multicardController.getApplicationInfo);

// Get recipient bank account details
router.get('/merchant-account/recipient', multicardController.getRecipientBankAccount);

// Get payment history for a store
router.get('/store/:storeId/history', multicardController.getPaymentHistory);

// Get credit history (payouts) for a store
router.get('/store/:storeId/credit-history', multicardController.getCreditHistory);

// Get payment statistics (aggregated)
router.get('/store/:storeId/statistics', multicardController.getPaymentStatistics);

// Export payment history to CSV
router.get('/store/:storeId/export', multicardController.exportPaymentHistory);

// ============================================
// VARIABLE MANAGEMENT ROUTES
// ============================================

/**
 * Get all stored variables
 */
router.get('/variables', (req, res) => {
    const allVars = getAllVariables();
    res.json({
        success: true,
        data: allVars,
        count: Object.keys(allVars).length
    });
});

/**
 * Get a specific variable
 */
router.get('/variables/:key', (req, res) => {
    const { key } = req.params;
    const value = getVariable(key);

    if (value === undefined) {
        return res.status(404).json({
            success: false,
            error: {
                code: 'VARIABLE_NOT_FOUND',
                details: `Variable {{${key}}} not found`
            }
        });
    }

    res.json({
        success: true,
        data: { key, value }
    });
});

/**
 * Set a variable manually
 */
router.post('/variables', (req, res) => {
    const { key, value } = req.body;

    if (!key || value === undefined) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'MISSING_FIELDS',
                details: 'Both key and value are required'
            }
        });
    }

    setVariable(key, value);

    res.json({
        success: true,
        message: `Variable {{${key}}} set successfully`,
        data: { key, value }
    });
});

/**
 * Clear all variables
 */
router.delete('/variables', (req, res) => {
    clearVariables();
    res.json({
        success: true,
        message: 'All variables cleared'
    });
});

/**
 * Clear a specific variable
 */
router.delete('/variables/:key', (req, res) => {
    const { key } = req.params;
    const value = getVariable(key);

    if (value === undefined) {
        return res.status(404).json({
            success: false,
            error: {
                code: 'VARIABLE_NOT_FOUND',
                details: `Variable {{${key}}} not found`
            }
        });
    }

    deleteVariable(key);

    res.json({
        success: true,
        message: `Variable {{${key}}} deleted`
    });
});

// ============================================
// CATCH-ALL ERROR HANDLER
// ============================================

router.all('*', (req, res) => {
    console.error('❌ Multicard route not found:', {
        method: req.method,
        path: req.path,
        originalUrl: req.originalUrl
    });

    res.status(404).json({
        success: false,
        error: {
            code: 'ROUTE_NOT_FOUND',
            message: `Multicard route not found: ${req.method} ${req.path}`,
            availableRoutes: [
                'POST /api/payments/multicard/initiate',
                'GET /api/payments/multicard/debug/env',
                'GET /api/payments/multicard/debug/auth',
                'GET /api/payments/multicard/debug/routes'
            ]
        }
    });
});

module.exports = router;