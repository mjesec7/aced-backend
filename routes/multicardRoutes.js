const express = require('express');
const router = express.Router();
const axios = require('axios');
const multicardController = require('../controllers/multicardController');
const { getAuthToken } = require('../controllers/multicardAuth');
const MulticardTransaction = require('../models/MulticardTransaction');
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

// Add logging middleware for all multicard requests
router.use((req, res, next) => {
    console.log('🔵 Multicard Route Hit:', {
        method: req.method,
        path: req.path,
        fullUrl: req.originalUrl,
        hasBody: !!req.body,
        contentType: req.headers['content-type'],
        authorization: req.headers.authorization ? '✅ Present' : '❌ Missing'
    });
    next();
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

        console.log(`🔍 Testing Multicard API with UUID: ${uuid}`);
        console.log(`   API URL: ${process.env.MULTICARD_API_URL}/payment/invoice/${uuid}`);
        console.log(`   Token: ${token.substring(0, 20)}...`);

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

        console.log(`✅ Response status: ${response.status}`);
        console.log(`   Success: ${response.data.success}`);

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
    console.warn('   Query params:', req.query);
    console.warn('   Headers:', req.headers);
    
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

// Webhooks - New format (recommended)
router.post('/webhook', multicardController.handleWebhook);

// Success callback - Old format (deprecated but kept for compatibility)
router.post('/success', multicardController.handleSuccessCallbackOld);

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
    console.log(`🗑️ Variable deleted: {{${key}}}`);

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