const axios = require('axios');
const dotenv = require('dotenv');
const crypto = require('crypto');
const mongoose = require('mongoose');

const MulticardTransaction = require('../models/MulticardTransaction');
const User = require('../models/user');
const { getAuthToken } = require('./multicardAuth');

dotenv.config();

const API_URL = process.env.MULTICARD_API_URL;

// Store for variables (in-memory)
const variables = new Map();

/**
 * Replace {{variables}} in any value (string, object, array)
 */
const replaceVariables = (value) => {
    if (typeof value === 'string') {
        return value.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
            const varValue = variables.get(key.trim());
            return varValue !== undefined ? varValue : match;
        });
    }

    if (Array.isArray(value)) {
        return value.map(item => replaceVariables(item));
    }

    if (value !== null && typeof value === 'object') {
        const result = {};
        for (const [key, val] of Object.entries(value)) {
            result[key] = replaceVariables(val);
        }
        return result;
    }

    return value;
};

/**
 * Set a variable for later use
 */
const setVariable = (key, value) => {
    variables.set(key, value);
};

/**
 * Get a specific variable
 */
const getVariable = (key) => {
    return variables.get(key);
};

/**
 * Get all stored variables as a plain object
 */
const getAllVariables = () => {
    return Object.fromEntries(variables.entries());
};

/**
 * Clear all stored variables
 */
const clearVariables = () => {
    variables.clear();
};

/**
 * Delete a specific variable
 */
const deleteVariable = (key) => {
    variables.delete(key);
};


/**
 * Automatically find and store key variables from a Multicard API response
 */
const autoStoreVariables = (responseBody) => {
    if (!responseBody || typeof responseBody !== 'object' || !responseBody.data) {
        return;
    }

    const data = responseBody.data;

    // A simple recursive flattener to find and store values
    const flattenAndStore = (obj, prefix = '') => {
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const newKey = prefix ? `${prefix}_${key}` : key;
                const value = obj[key];
                if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                    flattenAndStore(value, newKey);
                } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                    // Store only non-null/non-empty values
                    if (value) {
                        setVariable(newKey, value);
                    }
                }
            }
        }
    };

    flattenAndStore(data);
};


/**
 * Controller function to initiate a payment.
 * Creates an invoice with Multicard and returns the checkout URL.
 */
const initiatePayment = async (req, res) => {
    const { userId, plan, amount, ofd, lang, sms } = req.body;

    // Validate required fields
    if (!userId || !plan || !amount || !ofd) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'userId, plan, amount, and ofd are required.'
            }
        });
    }

    try {
        // Find user by firebaseId or MongoDB _id
        const user = await User.findOne({
            $or: [
                { firebaseId: userId },
                { _id: mongoose.Types.ObjectId.isValid(userId) ? userId : null }
            ]
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    details: 'User not found'
                }
            });
        }

        // ✅ FIX: Get authentication token with proper credentials
        const token = await getAuthToken();

        // ✅ FIX: Create cleaner invoice ID
        const timestamp = Date.now();
        const invoiceId = `ACED_${plan.toUpperCase()}_${timestamp}`;

        const callbackUrl = `${process.env.API_BASE_URL}/api/payments/multicard/webhook`;

        // ✅ FIX: Use correct store ID from env
        const storeId = parseInt(process.env.MULTICARD_STORE_ID) || 2660;

        // Expect `amount` to be provided in tiyin (minor units).
        // Frontend sends tiyin via `uzsToTiyin()` helper. Use sensible defaults in tiyin.
        let finalAmount = amount || (plan === 'pro' ? 45500000 : 26000000);
        // Build OFD array according to API specs
        const ofdData = ofd.map(item => ({
            qty: item.qty || 1,
            price: item.price || finalAmount, // Price in tiyin
            mxik: item.mxik || '10899002001000000',
            total: item.total || finalAmount, // Total in tiyin
            package_code: item.package_code || '1236095', // ✅ Use your actual package code
            name: item.name || `ACED ${plan.toUpperCase()} Plan`,
            vat: item.vat || 0
        }));

        const payload = {
            store_id: storeId,
            amount: finalAmount, // ✅ Amount in tiyin
            invoice_id: invoiceId,
            callback_url: callbackUrl,
            return_url: `${process.env.FRONTEND_URL}/payment-success`,
            return_error_url: `${process.env.FRONTEND_URL}/payment-failed`,
            lang: lang || 'ru',
            ofd: ofdData,
            // ✅ ADD: Store name for display
            store_name: 'ACED Education Platform'
        };

        // Add optional SMS field if provided
        if (sms) {
            payload.sms = sms;
        }

        const response = await axios.post(`${API_URL}/payment/invoice`, payload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Application-Id': process.env.MULTICARD_APPLICATION_ID,
                'X-Secret': process.env.MULTICARD_SECRET
            },
        });

        if (!response.data || !response.data.success) {
            const errorCode = response.data?.error?.code || 'UNKNOWN_ERROR';
            const errorDetails = response.data?.error?.details || 'Unknown error occurred';
            throw new Error(`Failed to create invoice: [${errorCode}] ${errorDetails}`);
        }

        const invoiceData = response.data.data;

        // ✅ Use MongoDB _id for transaction, and correct amount
        const transaction = new MulticardTransaction({
            userId: user._id, // ✅ Use MongoDB ObjectId
            firebaseUserId: userId, // ✅ Store Firebase UID separately
            invoiceId,
            amount: finalAmount, // ✅ Use finalAmount
            plan,
            status: 'pending',
            multicardUuid: invoiceData.uuid,
            checkoutUrl: invoiceData.checkout_url,
            shortLink: invoiceData.short_link,
            deeplink: invoiceData.deeplink,
        });

        await transaction.save();

        res.json({
            success: true,
            data: {
                uuid: invoiceData.uuid,
                checkoutUrl: invoiceData.checkout_url,
                shortLink: invoiceData.short_link,
                deeplink: invoiceData.deeplink,
                invoiceId: invoiceId,
                addedOn: invoiceData.added_on,
            }
        });

    } catch (error) {
        // ✅ ENHANCED ERROR LOGGING
        console.error('❌ Multicard API Error Details:');

        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Status Text:', error.response.statusText);
            console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
            console.error('Response Headers:', error.response.headers);

            // Check for specific Multicard error codes
            if (error.response.data?.error) {
                console.error('Multicard Error:', error.response.data.error);
            }
            if (error.response.data?.errors) {
                console.error('Multicard Errors:', error.response.data.errors);
            }

            // Return more detailed error to frontend
            return res.status(500).json({
                success: false,
                error: {
                    code: 'PAYMENT_INITIATION_FAILED',
                    details: error.response.data?.error?.details ||
                        error.response.data?.error ||
                        error.response.data?.message ||
                        'Multicard API rejected the request',
                    multicardStatus: error.response.status,
                    multicardError: error.response.data
                }
            });
        } else if (error.request) {
            console.error('No response received from Multicard');
            console.error('Request:', error.request);

            return res.status(500).json({
                success: false,
                error: {
                    code: 'MULTICARD_NO_RESPONSE',
                    details: 'No response from Multicard API'
                }
            });
        } else {
            console.error('Error setting up request:', error.message);

            return res.status(500).json({
                success: false,
                error: {
                    code: 'REQUEST_SETUP_ERROR',
                    details: error.message
                }
            });
        }
    }
};


/**
 * Controller function to handle the success callback (when user returns from payment page).
 * This is called when the payment is successful and user is redirected back.
 */
const handleSuccessCallback = async (req, res) => {
    const { invoice_id, uuid } = req.query;

    if (!invoice_id) {
        return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?error=missing_invoice_id`);
    }

    try {
        const transaction = await MulticardTransaction.findOne({ invoiceId: invoice_id });
        if (!transaction) {
            console.error(`❌ Transaction not found for invoice_id: ${invoice_id}`);
            return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?error=transaction_not_found`);
        }

        // Verify payment status with Multicard API
        const token = await getAuthToken();
        const response = await axios.get(
            `${API_URL}/payment/invoice/${uuid || transaction.multicardUuid}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (response.data?.success && response.data.data?.payment?.status === 'success') {
            // Payment confirmed - but wait for webhook for final processing
            res.redirect(`${process.env.FRONTEND_URL}/payment-success?invoice_id=${invoice_id}`);
        } else {
            res.redirect(`${process.env.FRONTEND_URL}/payment-pending?invoice_id=${invoice_id}`);
        }

    } catch (error) {
        console.error('❌ Error handling success callback:', error.message);
        res.redirect(`${process.env.FRONTEND_URL}/payment-failed?error=verification_failed`);
    }
};

/**
 * Controller function to handle the incoming webhook from Multicard.
 * This is the authoritative notification about payment status.
 */
const handleWebhook = async (req, res) => {
    const webhookData = req.body;

    // Extract payment data from webhook
    const payment = webhookData.payment;

    if (!payment || !payment.store_invoice_id) {
        console.error('❌ Invalid webhook data: store_invoice_id is missing.');
        return res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_WEBHOOK',
                details: 'Missing store_invoice_id in webhook payload'
            }
        });
    }

    try {
        // Find the transaction using your internal invoice ID
        const transaction = await MulticardTransaction.findOne({
            invoiceId: payment.store_invoice_id
        });

        if (!transaction) {
            console.error(`❌ Transaction not found for invoice_id: ${payment.store_invoice_id}`);
            return res.status(404).json({
                success: false,
                error: {
                    code: 'TRANSACTION_NOT_FOUND',
                    details: `Transaction not found for invoice_id: ${payment.store_invoice_id}`
                }
            });
        }

        // Idempotency check: If already processed, return success
        if (transaction.status === 'paid' || transaction.status === 'failed' || transaction.status === 'canceled') {
            return res.status(200).json({
                success: true,
                message: 'Webhook already processed'
            });
        }

        // Store the full webhook payload for auditing
        transaction.webhookPayload = webhookData;
        transaction.multicardUuid = payment.uuid;
        transaction.paymentDetails = {
            paymentAmount: payment.payment_amount,
            commissionAmount: payment.commission_amount,
            commissionType: payment.commission_type,
            totalAmount: payment.total_amount,
            ps: payment.ps, // Payment service (uzcard, humo, visa, etc.)
            phone: payment.phone,
            cardPan: payment.card_pan,
            terminalId: payment.terminal_id,
            merchantId: payment.merchant_id,
            psUniqId: payment.ps_uniq_id, // RRN/RefNum
            psResponseCode: payment.ps_response_code,
            psResponseMsg: payment.ps_response_msg,
            receiptUrl: payment.receipt_url,
            paymentTime: payment.payment_time,
        };

        // Process based on payment status
        // Status enum: draft, progress, billing, success, error, revert
        if (payment.status === 'success') {
            transaction.status = 'paid';
            transaction.paidAt = new Date(payment.payment_time || Date.now());

            // Find the user and grant them their subscription/purchase
            const user = await User.findById(transaction.userId);
            if (user) {
                const durationDays = transaction.plan === 'pro' ? (transaction.amount <= 1000000 ? 1 : (transaction.amount >= 100000000 ? 180 : (transaction.amount >= 60000000 ? 90 : 30))) : 30;
                const durationMonths = durationDays === 1 ? 0 : durationDays / 30;

                await user.grantSubscription(transaction.plan, durationDays, 'multicard', durationMonths);

                user.subscriptionAmount = transaction.amount;
                user.lastPaymentDate = new Date();
                await user.save();
            } else {
                console.error(`❌ User not found: ${transaction.userId}`);
            }
        } else if (payment.status === 'revert') {
            transaction.status = 'refunded';
        } else if (payment.status === 'error') {
            transaction.status = 'failed';
            transaction.errorCode = payment.ps_response_code;
            transaction.errorMessage = payment.ps_response_msg;
        } else {
            // draft, progress, billing - transaction still pending
        }

        await transaction.save();

        // Always return success to Multicard to prevent retries
        res.status(200).json({
            success: true,
            message: 'Webhook processed successfully'
        });

    } catch (error) {
        console.error('❌ Error processing webhook:', error.message);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                details: 'Failed to process webhook'
            }
        });
    }
};

/**
 * Get invoice/payment information
 * Fixed to properly look up UUID first
 */
const getInvoiceInfo = async (req, res) => {
    const { invoiceId } = req.params;

    try {
        // STEP 1: Find transaction in your database by invoiceId
        const transaction = await MulticardTransaction.findOne({ invoiceId });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'TRANSACTION_NOT_FOUND',
                    details: 'Transaction not found in database'
                }
            });
        }

        // STEP 2: Check if we have a Multicard UUID
        if (!transaction.multicardUuid) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_UUID',
                    details: 'Transaction exists but has no Multicard UUID'
                }
            });
        }

        // STEP 3: Fetch from Multicard API using UUID
        const token = await getAuthToken();

        const response = await axios.get(
            `${API_URL}/payment/invoice/${transaction.multicardUuid}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Access-Token': process.env.MULTICARD_TOKEN || ''
                }
            }
        );

        if (response.data?.success) {
            res.json({
                success: true,
                data: {
                    local: {
                        invoiceId: transaction.invoiceId,
                        status: transaction.status,
                        amount: transaction.amount,
                        plan: transaction.plan,
                        createdAt: transaction.createdAt,
                        paidAt: transaction.paidAt,
                        paymentDetails: transaction.paymentDetails,
                    },
                    multicard: response.data.data
                }
            });
        } else {
            throw new Error('Failed to fetch invoice info from Multicard');
        }

    } catch (error) {
        console.error('❌ Error fetching invoice info:', error.message);

        // Handle specific error cases
        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'INVOICE_NOT_FOUND',
                    details: 'Invoice not found in Multicard system. It may have been deleted or expired.'
                }
            });
        }

        if (error.response?.status === 401 || error.response?.status === 403) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'AUTH_ERROR',
                    details: 'Authentication failed. Check your Bearer token and X-Access-Token.'
                }
            });
        }

        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'FETCH_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Cancel/Delete an invoice
 */
const cancelInvoice = async (req, res) => {
    const { invoiceId } = req.params;

    try {
        const transaction = await MulticardTransaction.findOne({ invoiceId });
        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'TRANSACTION_NOT_FOUND',
                    details: 'Transaction not found'
                }
            });
        }

        if (transaction.status === 'paid') {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'CANNOT_CANCEL_PAID',
                    details: 'Cannot cancel a paid transaction'
                }
            });
        }

        const token = await getAuthToken();
        const response = await axios.delete(
            `${API_URL}/payment/invoice/${transaction.multicardUuid}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (response.data?.success) {
            transaction.status = 'canceled';
            await transaction.save();

            res.json({
                success: true,
                message: 'Invoice canceled successfully'
            });
        } else {
            throw new Error('Failed to cancel invoice on Multicard');
        }

    } catch (error) {
        console.error('❌ Error canceling invoice:', error.message);
        res.status(500).json({
            success: false,
            error: {
                code: 'CANCEL_ERROR',
                details: 'Failed to cancel invoice'
            }
        });
    }
};

/**
 * Test connection to Multicard API
 */
const testConnection = async (req, res) => {
    try {
        const token = await getAuthToken();
        res.json({
            success: true,
            message: 'Successfully connected to Multicard API',
            token: token.substring(0, 20) + '...',
            // tokenExpiry is not available here, but you can fetch it if needed
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: {
                code: 'CONNECTION_FAILED',
                details: error.message
            }
        });
    }
};

/**
 * Process QR code payment (PaymeGo, ClickPass, Uzum, Anorbank, Xazna)
 * This allows payment via scanned QR codes from payment apps
 */
const processScanPay = async (req, res) => {
    const { uuid } = req.params;
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'QR code is required'
            }
        });
    }

    try {
        const transaction = await MulticardTransaction.findOne({ multicardUuid: uuid });
        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'TRANSACTION_NOT_FOUND',
                    details: 'Transaction not found'
                }
            });
        }

        const token = await getAuthToken();

        const response = await axios.put(
            `${API_URL}/payment/${uuid}/scanpay`,
            { code },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data?.success) {
            const paymentData = response.data.data;

            // Update transaction with payment details
            transaction.status = paymentData.status === 'success' ? 'paid' : 'pending';
            transaction.paymentDetails = {
                paymentAmount: paymentData.payment_amount,
                commissionAmount: paymentData.commission_amount,
                commissionType: paymentData.commission_type,
                totalAmount: paymentData.total_amount,
                ps: paymentData.ps,
                phone: paymentData.phone,
                cardPan: paymentData.card_pan,
                terminalId: paymentData.terminal_id,
                merchantId: paymentData.merchant_id,
                psUniqId: paymentData.ps_uniq_id,
                psResponseCode: paymentData.ps_response_code,
                psResponseMsg: paymentData.ps_response_msg,
                receiptUrl: paymentData.receipt_url,
                paymentTime: paymentData.payment_time,
            };

            if (paymentData.status === 'success') {
                transaction.paidAt = new Date(paymentData.payment_time || Date.now());

                // Grant subscription
                const user = await User.findById(transaction.userId);
                if (user) {
                    const durationDays = transaction.plan === 'pro' ? 365 : 30;
                    await user.grantSubscription(transaction.plan, durationDays, 'multicard');
                }
            }

            await transaction.save();

            res.json({
                success: true,
                data: paymentData
            });
        } else {
            throw new Error('Failed to process scan payment');
        }

    } catch (error) {
        console.error('❌ Error processing scan payment:', error.message);

        // Check for specific error codes
        if (error.response?.data?.error?.code === 'ERROR_DEBIT_UNKNOWN') {
            console.warn('⚠️ Unknown debit error - check payment status manually');
        }

        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'SCANPAY_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Handle success callback (old format - deprecated but kept for compatibility)
 * This uses MD5 signature verification
 */
const handleSuccessCallbackOld = async (req, res) => {
    const callbackData = req.body;

    const {
        store_id,
        amount,
        invoice_id,
        billing_id,
        payment_time,
        phone,
        card_pan,
        ps,
        card_token,
        uuid,
        receipt_url,
        sign
    } = callbackData;

    // Verify signature: MD5({store_id}{invoice_id}{amount}{secret})
    const signatureString = `${store_id}${invoice_id}${amount}${process.env.MULTICARD_SECRET}`;

    const expectedSign = crypto
        .createHash('md5')
        .update(signatureString)
        .digest('hex');

    if (sign !== expectedSign) {
        console.error('❌ Invalid signature in success callback');
        console.error(`   Expected: ${expectedSign}`);
        console.error(`   Received: ${sign}`);

        // ✅ TEMP FIX FOR TESTING: Allow in development mode
        if (process.env.NODE_ENV !== 'development') {
            return res.status(403).json({
                success: false,
                message: 'Invalid signature'
            });
        } else {
            console.warn('⚠️ Signature mismatch ignored in development mode');
        }
    }

    try {
        const transaction = await MulticardTransaction.findOne({ invoiceId: invoice_id });

        if (!transaction) {
            console.error(`❌ Transaction not found: ${invoice_id}`);
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

        // Idempotency check
        if (transaction.status === 'paid') {
            return res.status(200).json({
                success: true,
                message: 'Transaction already processed'
            });
        }

        // Update transaction
        transaction.status = 'paid';
        transaction.paidAt = new Date(payment_time);
        transaction.multicardUuid = uuid;
        transaction.paymentDetails = {
            ps,
            phone,
            cardPan: card_pan,
            cardToken: card_token,
            receiptUrl: receipt_url,
            billingId: billing_id,
            paymentTime: new Date(payment_time),
        };

        await transaction.save();

        // Grant subscription to user
        const user = await User.findById(transaction.userId);
        if (user) {
            const durationDays = transaction.plan === 'pro' ? 365 : 30;
            await user.grantSubscription(transaction.plan, durationDays, 'multicard');
        } else {
            console.error(`❌ User not found: ${transaction.userId}`);
        }

        res.status(200).json({
            success: true,
            message: 'Payment processed successfully'
        });

    } catch (error) {
        console.error('❌ Error processing success callback:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
/**
 * Handle webhook callback (new format with status updates)
 * This uses SHA1 signature verification
 * Supports multiple payment statuses: draft, progress, success, error, revert, hold
 */
const handleWebhookCallback = async (req, res) => {
    const webhookData = req.body;

    const {
        uuid,
        amount,
        invoice_id,
        status,
        billing_id,
        payment_time,
        refund_time,
        phone,
        card_pan,
        ps,
        card_token,
        receipt_url,
        sign
    } = webhookData;

    // Verify signature: SHA1({uuid}{invoice_id}{amount}{secret})
    const expectedSign = crypto
        .createHash('sha1')
        .update(`${uuid}${invoice_id}${amount}${process.env.MULTICARD_SECRET}`)
        .digest('hex');

    if (sign !== expectedSign) {
        console.error('❌ Invalid signature in webhook callback');
        console.error(`   Expected: ${expectedSign}`);
        console.error(`   Received: ${sign}`);
        return res.status(403).json({
            success: false,
            message: 'Invalid signature'
        });
    }

    try {
        const transaction = await MulticardTransaction.findOne({ invoiceId: invoice_id });
        if (!transaction) {
            console.error(`❌ Transaction not found: ${invoice_id}`);
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

        // Store webhook data
        transaction.webhookPayload = webhookData;
        transaction.multicardUuid = uuid;

        // Handle different statuses
        switch (status) {
            case 'draft':
                transaction.status = 'pending';
                break;

            case 'progress':
                transaction.status = 'pending';
                break;

            case 'success':
                // Idempotency check
                if (transaction.status === 'paid') {
                    return res.status(200).json({ success: true });
                }

                transaction.status = 'paid';
                transaction.paidAt = new Date(payment_time);
                transaction.paymentDetails = {
                    ps,
                    phone,
                    cardPan: card_pan,
                    cardToken: card_token,
                    receiptUrl: receipt_url,
                    billingId: billing_id,
                    paymentTime: new Date(payment_time),
                };

                // Grant subscription
                const user = await User.findById(transaction.userId);
                if (user) {
                    const durationDays = transaction.plan === 'pro' ? 365 : 30;
                    await user.grantSubscription(transaction.plan, durationDays, 'multicard');
                }
                break;

            case 'error':
                transaction.status = 'failed';
                break;

            case 'revert':
                transaction.status = 'refunded';
                transaction.refundedAt = refund_time ? new Date(refund_time) : new Date();

                // Revoke subscription if needed
                const userToRevoke = await User.findById(transaction.userId);
                if (userToRevoke) {
                    await userToRevoke.revokeSubscription('multicard');
                }
                break;

            case 'hold':
                transaction.status = 'pending';
                break;

            default:
                break;
        }

        await transaction.save();

        // Return 2xx status to prevent retries
        res.status(200).json({
            success: true,
            message: 'Webhook processed'
        });

    } catch (error) {
        console.error('❌ Error processing webhook callback:', error.message);
        res.status(200).json({
            success: true,
            message: 'Error logged, preventing retry'
        });
    }
};

/**
 * Delete/Cancel an invoice (if not yet paid)
 */
const deleteInvoice = async (req, res) => {
    const { uuid } = req.params;

    try {
        const transaction = await MulticardTransaction.findOne({ multicardUuid: uuid });
        if (!transaction) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'TRANSACTION_NOT_FOUND',
                    details: 'Transaction not found'
                }
            });
        }

        if (transaction.status === 'paid') {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'CANNOT_DELETE_PAID',
                    details: 'Cannot delete a paid invoice'
                }
            });
        }

        const token = await getAuthToken();

        const response = await axios.delete(
            `${API_URL}/payment/invoice/${uuid}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (response.data?.success) {
            transaction.status = 'canceled';
            await transaction.save();

            res.json({
                success: true,
                data: null
            });
        } else {
            throw new Error('Failed to delete invoice');
        }

    } catch (error) {
        console.error('❌ Error deleting invoice:', error.message);
        res.status(500).json({
            success: false,
            error: {
                code: 'DELETE_ERROR',
                details: error.message
            }
        });
    }
};

/**
 * Create card binding session - FIXED VERSION
 */
const createCardBindingSession = async (req, res) => {
    const { userId, redirectUrl, redirectDeclineUrl, callbackUrl } = req.body;

    if (!userId || !redirectUrl || !redirectDeclineUrl || !callbackUrl) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'userId, redirectUrl, redirectDeclineUrl, and callbackUrl are required'
            }
        });
    }

    try {
        // Find user by firebaseId or MongoDB _id
        const user = await User.findOne({
            $or: [
                { firebaseId: userId },
                { _id: mongoose.Types.ObjectId.isValid(userId) ? userId : null }
            ]
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    details: 'User not found'
                }
            });
        }

        const token = await getAuthToken();
        const storeId = parseInt(process.env.MULTICARD_STORE_ID);

        const finalCallbackUrl = callbackUrl || `${process.env.API_BASE_URL}/api/payments/multicard/card-binding/callback`;

        const response = await axios.post(
            `${API_URL}/payment/card/bind`,
            {
                redirect_url: redirectUrl,
                redirect_decline_url: redirectDeclineUrl,
                store_id: storeId,
                callback_url: finalCallbackUrl
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data?.success) {
            const sessionData = response.data.data;

            // ✅ Store session in MulticardTransaction with type 'card_binding'
            const bindingSession = new MulticardTransaction({
                userId: user._id,
                transactionType: 'card_binding',
                sessionId: sessionData.session_id,
                formUrl: sessionData.form_url,
                redirectUrl,
                redirectDeclineUrl,
                callbackUrl: finalCallbackUrl,
                status: 'pending',
                expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
            });
            await bindingSession.save();


            res.json({
                success: true,
                data: {
                    sessionId: sessionData.session_id,
                    formUrl: sessionData.form_url,
                    expiresIn: 900 // 15 minutes in seconds
                }
            });
        } else {
            throw new Error('Failed to create card binding session');
        }

    } catch (error) {
        console.error('❌ Error creating card binding session:', error);

        if (error.response?.status === 401) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'AUTH_ERROR',
                    details: 'Invalid Bearer token'
                }
            });
        }

        res.status(500).json({
            success: false,
            error: {
                code: 'BINDING_SESSION_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Handle card binding callback - FIXED VERSION
 */
const handleCardBindingCallback = async (req, res) => {
    const callbackData = req.body;

    const { payer_id, card_token, card_pan, ps, status, phone, holder_name, pinfl } = callbackData;

    try {
        // ✅ Find session by payer_id (which is the session_id) using the correct model
        const session = await MulticardTransaction.findOne({ sessionId: payer_id, transactionType: 'card_binding' });

        if (!session) {
            console.error(`❌ Session not found for payer_id: ${payer_id}`);
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        // Only process if binding was successful
        if (status === 'active') {
            // Update session with card details
            session.status = 'active';
            // Add card details to a nested object for clarity
            session.cardDetails = {
                cardToken: card_token,
                cardPan: card_pan,
                ps: ps,
                phone: phone,
                holderName: holder_name,
                pinfl: pinfl,
            };
            session.boundAt = new Date();
            session.callbackPayload = callbackData;

            await session.save();

            // Also save to user's savedCards array
            const user = await User.findById(session.userId);
            if (user) {
                if (!user.savedCards) {
                    user.savedCards = [];
                }
                const existingCard = user.savedCards.find(card => card.cardToken === card_token);

                if (!existingCard) {
                    user.savedCards.push({
                        cardToken: card_token,
                        cardPan: card_pan,
                        ps: ps,
                        holderName: holder_name,
                        addedAt: new Date()
                    });
                    await user.save();
                }
            }

        } else if (status === 'draft') {
            session.status = 'pending';
            await session.save();
        } else {
            session.status = 'failed';
            session.callbackPayload = callbackData;
            await session.save();
        }

        res.status(200).json({
            success: true,
            message: 'Card binding callback processed'
        });

    } catch (error) {
        console.error('❌ Error processing card binding callback:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Check card binding status - FIXED VERSION
 */
const checkCardBindingStatus = async (req, res) => {
    const { sessionId } = req.params;

    try {
        // First check our database using the correct model
        const session = await MulticardTransaction.findOne({ sessionId, transactionType: 'card_binding' });

        if (!session) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'SESSION_NOT_FOUND',
                    details: 'Card binding session not found'
                }
            });
        }

        // Then check with Multicard API
        const token = await getAuthToken();

        const response = await axios.get(
            `${API_URL}/payment/card/bind/${sessionId}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (response.data?.success) {
            const multicardData = response.data.data;

            // Update session if status changed
            if (multicardData.status === 'active' && session.status !== 'active') {
                session.status = 'active';
                session.cardDetails = {
                    cardToken: multicardData.card_token,
                    cardPan: multicardData.card_pan,
                    ps: multicardData.ps,
                    phone: multicardData.phone,
                    holderName: multicardData.holder_name,
                };
                session.boundAt = new Date();
                await session.save();

                // Also save to user's savedCards array
                const user = await User.findById(session.userId);
                if (user) {
                    if (!user.savedCards) {
                        user.savedCards = [];
                    }
                    const existingCard = user.savedCards.find(card => card.cardToken === multicardData.card_token);
                    if (!existingCard) {
                        user.savedCards.push({
                            cardToken: multicardData.card_token,
                            cardPan: multicardData.card_pan,
                            ps: multicardData.ps,
                            holderName: multicardData.holder_name,
                            addedAt: new Date()
                        });
                        await user.save();
                    }
                }
            }

            res.json({
                success: true,
                data: {
                    local: session,
                    multicard: multicardData
                }
            });
        } else {
            throw new Error('Failed to check card binding status');
        }

    } catch (error) {
        console.error('❌ Error checking card binding status:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: 'CHECK_STATUS_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Get card information by token
 */
const getCardInfoByToken = async (req, res) => {
    const { cardToken } = req.params;

    try {
        const token = await getAuthToken();

        const response = await axios.get(
            `${API_URL}/payment/card/${cardToken}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (response.data?.success) {
            res.json({
                success: true,
                data: response.data.data
            });
        } else {
            throw new Error('Failed to get card info');
        }

    } catch (error) {
        console.error('❌ Error getting card info:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: 'GET_CARD_INFO_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Add card using card details (API method - requires PCI DSS certification)
 * Sends SMS code to card holder's phone
 */
const addCardByDetails = async (req, res) => {
    const { pan, expiry, userPhone, cvc, holderName, sessionId } = req.body;

    if (!pan || !expiry) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'pan and expiry are required'
            }
        });
    }

    try {
        const token = await getAuthToken();

        const payload = {
            pan,
            expiry,
            ...(userPhone && { user_phone: userPhone }),
            ...(cvc && { cvc }),
            ...(holderName && { holder_name: holderName }),
            ...(sessionId && { session_id: sessionId })
        };

        const response = await axios.post(
            `${API_URL}/payment/card`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data?.success) {
            const cardData = response.data.data;

            res.json({
                success: true,
                data: cardData,
                message: 'SMS code sent to card holder phone'
            });
        } else {
            throw new Error('Failed to add card');
        }

    } catch (error) {
        console.error('❌ Error adding card:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'ADD_CARD_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Confirm card binding with OTP code
 */
const confirmCardBinding = async (req, res) => {
    const { cardToken } = req.params;
    const { otp } = req.body;

    if (!otp) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'OTP code is required'
            }
        });
    }

    try {
        const token = await getAuthToken();

        const response = await axios.put(
            `${API_URL}/payment/card/${cardToken}`,
            { otp },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data?.success) {
            const cardData = response.data.data;

            res.json({
                success: true,
                data: cardData
            });
        } else {
            throw new Error('Failed to confirm card binding');
        }

    } catch (error) {
        console.error('❌ Error confirming card binding:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'CONFIRM_BINDING_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Check if card belongs to PINFL (Uzcard and Humo only)
 */
const checkCardPinfl = async (req, res) => {
    const { pan, pinfl } = req.body;

    if (!pan || !pinfl) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'pan and pinfl are required'
            }
        });
    }

    if (pinfl.length !== 14) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_PINFL',
                details: 'PINFL must be exactly 14 characters'
            }
        });
    }

    try {
        const token = await getAuthToken();

        const response = await axios.post(
            `${API_URL}/payment/card/check-pinfl`,
            { pan, pinfl },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data?.success !== undefined) {
            const matches = response.data.data;

            res.json({
                success: true,
                data: matches // true, false, or null
            });
        } else {
            throw new Error('Failed to check PINFL');
        }

    } catch (error) {
        console.error('❌ Error checking PINFL:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'CHECK_PINFL_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Delete/Revoke card token
 */
const deleteCardToken = async (req, res) => {
    const { cardToken } = req.params;

    try {
        const token = await getAuthToken();

        const response = await axios.delete(
            `${API_URL}/payment/card/${cardToken}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (response.data?.success) {
            res.json({
                success: true,
                data: response.data.data || []
            });
        } else {
            throw new Error('Failed to delete card token');
        }

    } catch (error) {
        console.error('❌ Error deleting card token:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'DELETE_CARD_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};
/**
 * Check card information by PAN
 */
const checkCardByPan = async (req, res) => {
    const { pan } = req.params;

    if (!pan || pan.length < 16 || pan.length > 20) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_PAN',
                details: 'Card number must be between 16 and 20 digits'
            }
        });
    }

    try {
        const token = await getAuthToken();

        const response = await axios.get(
            `${API_URL}/payment/card/check/${pan}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (response.data?.success) {
            const cardData = response.data.data;

            res.json({
                success: true,
                data: cardData
            });
        } else {
            throw new Error('Failed to check card');
        }

    } catch (error) {
        console.error('❌ Error checking card by PAN:', error);

        if (error.response?.status === 400) {
            return res.status(400).json({
                success: false,
                error: {
                    code: error.response?.data?.error?.code || 'ERROR_CARD_NOT_FOUND',
                    details: error.response?.data?.error?.details || 'Card not found'
                }
            });
        }

        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: 'CHECK_CARD_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};
/**
 * Create payment by card token
 * This allows payment on Partner's page using saved card token
 */
const createPaymentByToken = async (req, res) => {
    try {
        // Replace variables in the entire request body
        const processedBody = replaceVariables(req.body);

        const {
            card,
            payment_system,
            paymentSystem,
            amount,
            storeId,
            store_id,
            invoiceId,
            invoice_id,
            callbackUrl,
            callback_url,
            deviceDetails,
            device_details,
            ofd
        } = processedBody;

        // Normalize field names
        const finalStoreId = storeId || store_id;
        const finalInvoiceId = invoiceId || invoice_id;
        const finalCallbackUrl = callbackUrl || callback_url;
        const finalDeviceDetails = deviceDetails || device_details;
        const finalPaymentSystem = payment_system || paymentSystem;

        // Validate required fields
        if (!amount || !finalStoreId || !finalInvoiceId) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'ERROR_FIELDS',
                    details: 'amount, storeId, and invoiceId are required'
                }
            });
        }

        // Validate payment method
        if (!card && !finalPaymentSystem) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'ERROR_PAYMENT_METHOD',
                    details: 'Either card (token or pan+expiry) OR payment_system is required'
                }
            });
        }

        // Validate card format if provided
        if (card && !card.token && (!card.pan || !card.expiry)) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'ERROR_CARD',
                    details: 'card must have either token OR (pan + expiry)'
                }
            });
        }

        const token = await getAuthToken();

        // Find user by Firebase UID if provided
        let userObjectId = req.user?._id;
        if (!userObjectId && processedBody.userId) {
            const User = require('../models/user');
            const user = await User.findOne({ firebaseId: processedBody.userId });
            if (user) {
                userObjectId = user._id;
            }
        }

        // Build payment payload
        const payload = {
            amount,
            store_id: finalStoreId,
            invoice_id: finalInvoiceId,
            ...(finalCallbackUrl && { callback_url: finalCallbackUrl }),
            ...(finalDeviceDetails && { device_details: finalDeviceDetails }),
            ...(ofd && { ofd })
        };

        // Add payment method to payload
        if (finalPaymentSystem) {
            payload.payment_system = finalPaymentSystem;
        } else if (card.token) {
            payload.card = { token: card.token };
        } else {
            payload.card = { pan: card.pan, expiry: card.expiry };
        }

        const response = await axios.post(
            `${API_URL}/payment`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data?.success) {
            const paymentData = response.data.data;

            // Store important values as variables
            if (paymentData.uuid) {
                setVariable('payment_uuid', paymentData.uuid);
            }
            if (paymentData.card_token) {
                setVariable('card_token', paymentData.card_token);
            }
            if (paymentData.store_invoice_id) {
                setVariable('invoice_id', paymentData.store_invoice_id);
            }

            // Create transaction record (only if userId is available)
            if (userObjectId) {
                const transaction = new MulticardTransaction({
                    userId: userObjectId,
                    multicardUuid: paymentData.uuid,
                    invoiceId: paymentData.store_invoice_id || finalInvoiceId,
                    amount: paymentData.total_amount || amount,
                    plan: processedBody.plan || 'standard',
                    status: paymentData.status === 'success' ? 'paid' : 'pending',
                    checkoutUrl: paymentData.checkout_url,
                    paymentDetails: {
                        paymentAmount: paymentData.payment_amount,
                        commissionAmount: paymentData.commission_amount,
                        commissionType: paymentData.commission_type,
                        totalAmount: paymentData.total_amount,
                        ps: paymentData.ps || finalPaymentSystem,
                        cardToken: paymentData.card_token,
                        cardPan: paymentData.card_pan,
                        otpHash: paymentData.otp_hash,
                    }
                });
                await transaction.save();
            }

            // If payment successful immediately, grant subscription
            if (paymentData.status === 'success' && userObjectId) {
                const User = require('../models/user');
                const user = await User.findById(userObjectId);
                if (user) {
                    const durationDays = processedBody.plan === 'pro' ? 365 : 30;
                    await user.grantSubscription(processedBody.plan || 'start', durationDays, 'multicard');
                }
            }

            res.json({
                success: true,
                data: paymentData,
                message: paymentData.checkout_url
                    ? `Redirect user to ${finalPaymentSystem || 'payment'} app`
                    : paymentData.otp_hash
                        ? 'OTP confirmation required'
                        : 'Payment created successfully'
            });
        } else {
            throw new Error('Failed to create payment');
        }

    } catch (error) {
        console.error('❌ Error creating payment:', error);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'PAYMENT_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Create payment with card details (PCI DSS required)
 * This allows direct payment using card PAN and expiry
 */
const createPaymentByCardDetails = async (req, res) => {
    const { card, amount, storeId, invoiceId, callbackUrl, deviceDetails, ofd } = req.body;

    if (!card?.pan || !card?.expiry || !amount || !storeId || !invoiceId) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'card.pan, card.expiry, amount, storeId, and invoiceId are required'
            }
        });
    }

    try {
        const token = await getAuthToken();

        const payload = {
            card: {
                pan: card.pan,
                expiry: card.expiry
            },
            amount,
            store_id: storeId,
            invoice_id: invoiceId,
            ...(callbackUrl && { callback_url: callbackUrl }),
            ...(deviceDetails && { device_details: deviceDetails }),
            ...(ofd && { ofd })
        };

        const response = await axios.post(
            `${API_URL}/payment`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data?.success) {
            const paymentData = response.data.data;

            // Find user by Firebase UID if provided
            let userObjectId = req.user?._id;
            if (!userObjectId && req.body.userId) {
                const User = require('../models/user');
                const user = await User.findOne({ firebaseId: req.body.userId });
                if (user) {
                    userObjectId = user._id;
                }
            }
            // Create transaction record
            const transaction = new MulticardTransaction({
                userId: userObjectId,  // ✅ Now it's an ObjectId
                multicardUuid: paymentData.uuid,
                invoiceId: paymentData.store_invoice_id,
                amount: paymentData.total_amount,
                plan: req.body.plan || 'standard',
                status: paymentData.status === 'success' ? 'paid' : 'pending',
                paymentDetails: {
                    paymentAmount: paymentData.payment_amount,
                    commissionAmount: paymentData.commission_amount,
                    commissionType: paymentData.commission_type,
                    totalAmount: paymentData.total_amount,
                    ps: paymentData.ps,
                    cardPan: paymentData.card_pan,
                    otpHash: paymentData.otp_hash,
                }
            });
            await transaction.save();

            res.json({
                success: true,
                data: paymentData,
                message: 'OTP sent to card holder'
            });
        } else {
            throw new Error('Failed to create payment');
        }

    } catch (error) {
        console.error('❌ Error creating payment by card details:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'PAYMENT_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Create split payment
 * Allows splitting payment between multiple recipients
 */
const createSplitPayment = async (req, res) => {
    const { card, amount, storeId, invoiceId, callbackUrl, ofd, split } = req.body;

    if (!card?.token || !amount || !storeId || !invoiceId || !split) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'card.token, amount, storeId, invoiceId, and split are required'
            }
        });
    }

    // Validate split amounts
    const totalSplitAmount = split.reduce((sum, item) => sum + item.amount, 0);
    if (totalSplitAmount > amount) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_SPLIT',
                details: 'Total split amount cannot exceed payment amount minus commission'
            }
        });
    }

    try {
        const token = await getAuthToken();

        const payload = {
            card: {
                token: card.token
            },
            amount,
            store_id: storeId,
            invoice_id: invoiceId,
            split,
            ...(callbackUrl && { callback_url: callbackUrl }),
            ...(ofd && { ofd })
        };

        const response = await axios.post(
            `${API_URL}/payment`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data?.success) {
            const paymentData = response.data.data;

            res.json({
                success: true,
                data: paymentData
            });
        } else {
            throw new Error('Failed to create split payment');
        }

    } catch (error) {
        console.error('❌ Error creating split payment:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'SPLIT_PAYMENT_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Create payment via payment apps (Payme, Click, Uzum, etc.)
 * Returns checkout_url to redirect user to payment app
 */
const createPaymentViaApp = async (req, res) => {
    const { paymentSystem, amount, storeId, invoiceId, callbackUrl, ofd } = req.body;

    const validSystems = ['payme', 'click', 'uzum', 'anorbank', 'alif', 'oson', 'xazna', 'beepul', 'trastpay', 'sbp'];

    if (!paymentSystem || !validSystems.includes(paymentSystem)) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_PAYMENT_SYSTEM',
                details: `payment_system must be one of: ${validSystems.join(', ')}`
            }
        });
    }

    if (!amount || !storeId || !invoiceId) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'paymentSystem, amount, storeId, and invoiceId are required'
            }
        });
    }

    try {
        const token = await getAuthToken();

        const payload = {
            payment_system: paymentSystem,
            amount,
            store_id: storeId,
            invoice_id: invoiceId,
            ...(callbackUrl && { callback_url: callbackUrl }),
            ...(ofd && { ofd })
        };

        const response = await axios.post(
            `${API_URL}/payment`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data?.success) {
            const paymentData = response.data.data;

            // Create transaction record
            const transaction = new MulticardTransaction({
                userId: req.user?._id || req.body.userId,
                multicardUuid: paymentData.uuid,
                invoiceId: paymentData.store_invoice_id,
                amount: paymentData.total_amount,
                plan: req.body.plan || 'standard',
                status: 'pending',
                checkoutUrl: paymentData.checkout_url,
                paymentDetails: {
                    ps: paymentData.ps,
                    totalAmount: paymentData.total_amount,
                }
            });
            await transaction.save();

            res.json({
                success: true,
                data: paymentData,
                message: `Redirect user to ${paymentSystem} app`
            });
        } else {
            throw new Error('Failed to create payment');
        }

    } catch (error) {
        console.error('❌ Error creating payment via app:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'PAYMENT_APP_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Confirm payment with OTP
 * Required when payment.otp_hash is not null
 */
const confirmPayment = async (req, res) => {
    let { paymentUuid } = req.params;
    paymentUuid = replaceVariables(paymentUuid);

    const processedBody = replaceVariables(req.body);
    const { otp, debitAvailable } = processedBody;

    if (!otp) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'OTP is required'
            }
        });
    }

    try {
        const token = await getAuthToken();

        const payload = {
            otp,
            debit_available: debitAvailable || false
        };

        const response = await axios.put(
            `${API_URL}/payment/${paymentUuid}`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data?.success) {
            const paymentData = response.data.data;

            // Update transaction
            const transaction = await MulticardTransaction.findOne({ multicardUuid: paymentUuid });
            if (transaction) {
                transaction.status = paymentData.status === 'success' ? 'paid' : 'pending';
                transaction.paymentDetails = {
                    ...transaction.paymentDetails,
                    paymentTime: paymentData.payment_time,
                    psResponseCode: paymentData.ps_response_code,
                    psResponseMsg: paymentData.ps_response_msg,
                };
                await transaction.save();
            }

            res.json({
                success: true,
                data: paymentData
            });
        } else {
            throw new Error('Failed to confirm payment');
        }

    } catch (error) {
        console.error('❌ Error confirming payment:', error.message);

        // Handle special error codes
        const errorCode = error.response?.data?.error?.code;
        if (errorCode === 'ERROR_DEBIT_UNKNOWN' || errorCode === 'ERROR_CALLBACK_TIMEOUT') {
            console.warn('⚠️ Payment status unknown - client should check payment status');
            return res.status(202).json({
                success: false,
                error: {
                    code: errorCode,
                    details: 'Payment status unknown. Please check payment status.',
                    action: 'CHECK_STATUS'
                }
            });
        }

        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'CONFIRM_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Send fiscal receipt URL
 * Used when Partner handles fiscalization
 */
const sendFiscalReceipt = async (req, res) => {
    let { paymentUuid } = req.params;
    paymentUuid = replaceVariables(paymentUuid);

    const processedBody = replaceVariables(req.body);
    const { url } = processedBody;

    if (!url) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'Fiscal receipt URL is required'
            }
        });
    }

    try {
        const token = await getAuthToken();

        const response = await axios.patch(
            `${API_URL}/payment/${paymentUuid}/fiscal`,
            { url },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data?.success !== undefined) {
            res.json({
                success: true,
                message: 'Fiscal receipt URL saved'
            });
        } else {
            throw new Error('Failed to send fiscal receipt');
        }

    } catch (error) {
        console.error('❌ Error sending fiscal receipt:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'FISCAL_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Refund payment (cancel and return funds)
 */
const refundPayment = async (req, res) => {
    let { paymentUuid } = req.params;
    paymentUuid = replaceVariables(paymentUuid);

    try {
        const token = await getAuthToken();

        const response = await axios.delete(
            `${API_URL}/payment/${paymentUuid}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (response.data?.success) {
            const paymentData = response.data.data;

            // Update transaction
            const transaction = await MulticardTransaction.findOne({ multicardUuid: paymentUuid });
            if (transaction) {
                transaction.status = 'refunded';
                transaction.refundedAt = new Date();
                await transaction.save();

                // Revoke subscription if needed
                if (transaction.userId) {
                    const user = await User.findById(transaction.userId);
                    if (user) {
                        await user.revokeSubscription('multicard');
                    }
                }
            }

            res.json({
                success: true,
                data: paymentData,
                message: 'Payment refunded successfully'
            });
        } else {
            throw new Error('Failed to refund payment');
        }

    } catch (error) {
        console.error('❌ Error refunding payment:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'REFUND_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Get payment information by UUID
 */
const getPaymentInfo = async (req, res) => {
    const { paymentUuid } = req.params;

    try {
        const token = await getAuthToken();

        const response = await axios.get(
            `${API_URL}/payment/${paymentUuid}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (response.data?.success) {
            res.json({
                success: true,
                data: response.data.data
            });
        } else {
            throw new Error('Failed to get payment info');
        }

    } catch (error) {
        console.error('❌ Error getting payment info:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: 'GET_PAYMENT_ERROR',
                details: error.message
            }
        });
    }
};

/**
 * Get application information
 * Returns details about your Multicard application/merchant account
 */
const getApplicationInfo = async (req, res) => {
    try {
        const token = await getAuthToken();

        const response = await axios.get(
            `${API_URL}/payment/application`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (response.data?.success) {
            const appInfo = response.data.data;

            res.json({
                success: true,
                data: appInfo
            });
        } else {
            throw new Error('Failed to get application info');
        }

    } catch (error) {
        console.error('❌ Error getting application info:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: 'APP_INFO_ERROR',
                details: error.message
            }
        });
    }
};

/**
 * Get recipient bank account details
 * Returns merchant's bank account information
 */
const getRecipientBankAccount = async (req, res) => {
    try {
        const token = await getAuthToken();

        const response = await axios.get(
            `${API_URL}/payment/merchant-account/recipient`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (response.data?.success) {
            const accountInfo = response.data.data;

            res.json({
                success: true,
                data: accountInfo
            });
        } else {
            throw new Error('Failed to get bank account info');
        }

    } catch (error) {
        console.error('❌ Error getting bank account info:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: 'BANK_ACCOUNT_ERROR',
                details: error.message
            }
        });
    }
};

/**
 * Get payment history for a store
 * Returns list of completed payment transactions with statistics
 */
const getPaymentHistory = async (req, res) => {
    const { storeId } = req.params;
    const {
        offset = 0,
        limit = 100,
        onlyStatus,
        startDate,
        endDate
    } = req.query;

    // Validate required fields
    if (!startDate || !endDate) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'startDate and endDate are required (format: YYYY-MM-DD HH:mm:ss)'
            }
        });
    }

    // Validate limit
    if (limit > 100) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_LIMIT',
                details: 'Limit cannot exceed 100'
            }
        });
    }

    try {
        const token = await getAuthToken();

        const params = {
            offset: parseInt(offset),
            limit: parseInt(limit),
            start_date: startDate,
            end_date: endDate,
            ...(onlyStatus && { only_status: onlyStatus })
        };

        const response = await axios.get(
            `${API_URL}/payment/store/${storeId}/history`,
            {
                headers: { 'Authorization': `Bearer ${token}` },
                params
            }
        );

        if (response.data?.success) {
            const historyData = response.data.data;

            res.json({
                success: true,
                data: historyData
            });
        } else {
            throw new Error('Failed to get payment history');
        }

    } catch (error) {
        console.error('❌ Error getting payment history:', error.message);

        // Handle specific errors
        if (error.response?.status === 403) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'ERROR_ACCESS_DENIED',
                    details: 'Access denied to this store'
                }
            });
        }

        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'HISTORY_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Get credit history (card top-ups/payouts)
 * Returns list of payouts made to cards
 */
const getCreditHistory = async (req, res) => {
    const { storeId } = req.params;
    const {
        offset = 0,
        limit = 100,
        onlyStatus,
        startDate,
        endDate
    } = req.query;

    // Validate required fields
    if (!startDate || !endDate) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'startDate and endDate are required (format: YYYY-MM-DD HH:mm:ss)'
            }
        });
    }

    // Validate limit
    if (limit > 100) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_LIMIT',
                details: 'Limit cannot exceed 100'
            }
        });
    }

    try {
        const token = await getAuthToken();

        const params = {
            offset: parseInt(offset),
            limit: parseInt(limit),
            start_date: startDate,
            end_date: endDate,
            ...(onlyStatus && { only_status: onlyStatus })
        };

        const response = await axios.get(
            `${API_URL}/payment/store/${storeId}/credit-history`,
            {
                headers: { 'Authorization': `Bearer ${token}` },
                params
            }
        );

        if (response.data?.success) {
            const creditData = response.data.data;

            res.json({
                success: true,
                data: creditData
            });
        } else {
            throw new Error('Failed to get credit history');
        }

    } catch (error) {
        console.error('❌ Error getting credit history:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: error.response?.data?.error?.code || 'CREDIT_HISTORY_ERROR',
                details: error.response?.data?.error?.details || error.message
            }
        });
    }
};

/**
 * Get payment statistics for dashboard
 * Helper method to get aggregated payment data
 */
const getPaymentStatistics = async (req, res) => {
    const { storeId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'startDate and endDate are required'
            }
        });
    }

    try {
        const token = await getAuthToken();

        // Get all transactions
        const response = await axios.get(
            `${API_URL}/payment/store/${storeId}/history`,
            {
                headers: { 'Authorization': `Bearer ${token}` },
                params: {
                    offset: 0,
                    limit: 1, // We only need stats, not full list
                    start_date: startDate,
                    end_date: endDate
                }
            }
        );

        if (response.data?.success) {
            const stats = response.data.data.stat;

            // Aggregate by status
            const aggregated = {
                success: { count: 0, amount: 0 },
                error: { count: 0, amount: 0 },
                progress: { count: 0, amount: 0 },
                draft: { count: 0, amount: 0 },
                revert: { count: 0, amount: 0 }
            };

            stats.forEach(stat => {
                if (aggregated[stat.status]) {
                    aggregated[stat.status].amount += parseInt(stat.payment_amount || 0);
                    aggregated[stat.status].count += 1;
                }
            });

            // Calculate totals
            const totalAmount = Object.values(aggregated).reduce((sum, s) => sum + s.amount, 0);
            const totalCount = response.data.data.pagination.total;

            res.json({
                success: true,
                data: {
                    period: { startDate, endDate },
                    total: {
                        count: totalCount,
                        amount: totalAmount
                    },
                    byStatus: aggregated,
                    stats: stats // Raw stats
                }
            });
        } else {
            throw new Error('Failed to get statistics');
        }

    } catch (error) {
        console.error('❌ Error getting statistics:', error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: {
                code: 'STATS_ERROR',
                details: error.message
            }
        });
    }
};

/**
 * Export payment history to CSV
 * Helper method for generating reports
 */
const exportPaymentHistory = async (req, res) => {
    const { storeId } = req.params;
    const { startDate, endDate, onlyStatus } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'startDate and endDate are required'
            }
        });
    }

    try {
        const token = await getAuthToken();

        // Fetch all pages
        let allTransactions = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
            const response = await axios.get(
                `${API_URL}/payment/store/${storeId}/history`,
                {
                    headers: { 'Authorization': `Bearer ${token}` },
                    params: {
                        offset,
                        limit,
                        start_date: startDate,
                        end_date: endDate,
                        ...(onlyStatus && { only_status: onlyStatus })
                    }
                }
            );

            if (response.data?.success) {
                const transactions = response.data.data.list;
                allTransactions = allTransactions.concat(transactions);

                hasMore = transactions.length === limit;
                offset += limit;
            } else {
                hasMore = false;
            }
        }

        // Convert to CSV
        const csvHeader = 'ID,UUID,Status,Payment System,Invoice ID,Payment Time,Amount,Commission,Card PAN,RRN\n';
        const csvRows = allTransactions.map(t =>
            `${t.id},${t.uuid},${t.status},${t.ps},${t.store_invoice_id},${t.payment_time || ''},${t.payment_amount},${t.commission_amount},${t.card_pan || ''},${t.ps_uniq_id || ''}`
        ).join('\n');

        const csv = csvHeader + csvRows;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=payments_${storeId}_${startDate}_${endDate}.csv`);
        res.send(csv);

    } catch (error) {
        console.error('❌ Error exporting history:', error.message);
        res.status(500).json({
            success: false,
            error: {
                code: 'EXPORT_ERROR',
                details: error.message
            }
        });
    }
};


// Export all controller functions
module.exports = {
    initiatePayment,
    handleSuccessCallback,
    handleWebhook,
    getInvoiceInfo,
    cancelInvoice,
    testConnection,
    processScanPay,
    handleSuccessCallbackOld,
    handleWebhookCallback,
    deleteInvoice,
    createCardBindingSession,
    handleCardBindingCallback,
    checkCardBindingStatus,
    getCardInfoByToken,
    addCardByDetails,
    confirmCardBinding,
    checkCardPinfl,
    deleteCardToken,
    checkCardByPan,
    createPaymentByToken,
    createPaymentByCardDetails,
    createSplitPayment,
    createPaymentViaApp,
    confirmPayment,
    sendFiscalReceipt,
    refundPayment,
    getPaymentInfo,
    getApplicationInfo,
    getRecipientBankAccount,
    getPaymentHistory,
    getCreditHistory,
    getPaymentStatistics,
    exportPaymentHistory,
    // Export variable management functions for routes
    setVariable,
    getVariable,
    getAllVariables,
    clearVariables,
    deleteVariable, // Exporting this function
};
