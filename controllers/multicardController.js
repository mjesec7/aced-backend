const axios = require('axios');
const dotenv = require('dotenv');
const crypto = require('crypto');
const MulticardTransaction = require('../models/multicardTransaction');
const User = require('../models/user');

dotenv.config();

const API_URL = process.env.MULTICARD_API_URL;
let authToken = null;
let tokenExpiry = 0;

/**
 * Gets a valid auth token from Multicard, requesting a new one if necessary.
 * Token is valid for 24 hours from creation.
 * @returns {Promise<string>} The JWT token.
 */
const getAuthToken = async () => {
    if (authToken && Date.now() < tokenExpiry) {
        return authToken;
    }
    try {
        console.log('🔑 Requesting Multicard auth token...');
        const response = await axios.post(`${API_URL}/auth`, {
            application_id: process.env.MULTICARD_APPLICATION_ID,
            secret: process.env.MULTICARD_SECRET,
        });

        if (response.data && response.data.token) {
            authToken = response.data.token;
            // Parse expiry time (format: "2023-03-18 16:40:31" in GMT+5)
            // Set margin of 1 hour before expiry
            const expiryDate = new Date(response.data.expiry);
            tokenExpiry = expiryDate.getTime() - (60 * 60 * 1000);
            
            console.log('✅ Token obtained successfully');
            console.log('   Role:', response.data.role);
            console.log('   Expires at:', response.data.expiry);
            
            return authToken;
        }
        throw new Error('Multicard authentication failed: Invalid response');
    } catch (error) {
        console.error('❌ Error fetching Multicard token:', error.response?.data || error.message);
        authToken = null;
        tokenExpiry = 0;
        throw error;
    }
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
        const user = await User.findById(userId);
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
        const invoiceId = `aced_${plan}_${userId}_${Date.now()}`;
        const callbackUrl = `${process.env.API_BASE_URL}/api/payments/multicard/webhook`;
        
        // Parse store_id - can be int or string according to API
        let storeId;
        if (isNaN(parseInt(process.env.MULTICARD_STORE_ID))) {
            storeId = process.env.MULTICARD_STORE_ID; // UUID string
        } else {
            storeId = parseInt(process.env.MULTICARD_STORE_ID); // Integer
        }

        // Build OFD array according to API specs
        const ofdData = ofd.map(item => ({
            qty: item.qty,
            price: item.price, // in tiyin
            mxik: item.mxik, // from tasnif.soliq.uz
            total: item.total, // in tiyin
            package_code: item.package_code, // from tasnif.soliq.uz
            name: item.name,
            ...(item.vat && { vat: item.vat }), // Optional
            ...(item.tin && { tin: item.tin }), // Optional
        }));

        const payload = {
            store_id: storeId,
            amount: amount, // Amount in tiyin (1 UZS = 100 tiyin)
            invoice_id: invoiceId,
            callback_url: callbackUrl,
            return_url: `${process.env.FRONTEND_URL}/payment-success`,
            return_error_url: `${process.env.FRONTEND_URL}/payment-failed`,
            lang: lang || 'ru', // 'ru', 'uz', or 'en'
            ofd: ofdData,
        };

        // Add optional SMS field if provided
        if (sms) {
            payload.sms = sms; // Format: 998XXXXXXXXX
        }

        console.log('📤 Creating Multicard invoice:', { 
            invoiceId, 
            amount, 
            storeId,
            itemCount: ofdData.length 
        });

        const response = await axios.post(`${API_URL}/payment/invoice`, payload, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
        });

        // Check for success flag in response
        if (!response.data || !response.data.success) {
            const errorCode = response.data?.error?.code || 'UNKNOWN_ERROR';
            const errorDetails = response.data?.error?.details || 'Unknown error occurred';
            throw new Error(`Failed to create invoice: [${errorCode}] ${errorDetails}`);
        }

        const invoiceData = response.data.data;
        
        // Create a pending transaction record in your database
        const transaction = new MulticardTransaction({
            userId,
            invoiceId,
            amount,
            plan,
            status: 'pending',
            multicardUuid: invoiceData.uuid,
            checkoutUrl: invoiceData.checkout_url,
            shortLink: invoiceData.short_link,
            deeplink: invoiceData.deeplink,
        });
        await transaction.save();

        console.log('✅ Invoice created successfully');
        console.log('   UUID:', invoiceData.uuid);
        console.log('   Checkout URL:', invoiceData.checkout_url);
        if (invoiceData.short_link) {
            console.log('   Short Link:', invoiceData.short_link);
        }

        res.json({
            success: true,
            data: {
                uuid: invoiceData.uuid,
                checkoutUrl: invoiceData.checkout_url,
                shortLink: invoiceData.short_link, // For QR codes (production only)
                deeplink: invoiceData.deeplink,
                invoiceId: invoiceId,
                addedOn: invoiceData.added_on,
            }
        });

    } catch (error) {
        console.error('❌ Error initiating Multicard payment:', error.message);
        
        // Return error in Multicard format
        res.status(500).json({ 
            success: false, 
            error: {
                code: 'PAYMENT_INITIATION_FAILED',
                details: error.message
            }
        });
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
    console.log('🔔 Received Multicard webhook:', JSON.stringify(webhookData, null, 2));

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
            console.log(`✅ Transaction already processed: ${payment.store_invoice_id}, status: ${transaction.status}`);
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
                const durationDays = transaction.plan === 'pro' ? 365 : 30;
                await user.grantSubscription(transaction.plan, durationDays, 'multicard');
                console.log(`✅ Subscription granted for plan "${transaction.plan}" to user ${user.email}.`);
                console.log(`   Payment ID: ${payment.id}`);
                console.log(`   Payment System: ${payment.ps}`);
                console.log(`   Card: ${payment.card_pan || 'N/A'}`);
                console.log(`   Amount: ${payment.total_amount} tiyin`);
            } else {
                console.error(`❌ User not found: ${transaction.userId}`);
            }
        } else if (payment.status === 'revert') {
            transaction.status = 'refunded';
            console.warn(`🔄 Payment was refunded for invoice_id: ${payment.store_invoice_id}`);
        } else if (payment.status === 'error') {
            transaction.status = 'failed';
            transaction.errorCode = payment.ps_response_code;
            transaction.errorMessage = payment.ps_response_msg;
            console.warn(`🔶 Payment failed for invoice_id: ${payment.store_invoice_id}`);
            console.warn(`   Error Code: ${payment.ps_response_code}`);
            console.warn(`   Error Message: ${payment.ps_response_msg}`);
        } else {
            // draft, progress, billing - transaction still pending
            console.log(`⏳ Payment status: ${payment.status} for invoice_id: ${payment.store_invoice_id}`);
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
 */
const getInvoiceInfo = async (req, res) => {
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

        const token = await getAuthToken();
        const response = await axios.get(
            `${API_URL}/payment/invoice/${transaction.multicardUuid}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (response.data?.success) {
            res.json({
                success: true,
                data: {
                    local: {
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
        res.status(500).json({ 
            success: false, 
            error: {
                code: 'FETCH_ERROR',
                details: 'Failed to fetch invoice information'
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
            tokenExpiry: new Date(tokenExpiry).toISOString()
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
        
        console.log(`📱 Processing scan payment for transaction: ${uuid}`);
        console.log(`   Code: ${code.substring(0, 10)}...`);

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
                    console.log(`✅ Subscription granted via ${paymentData.ps}`);
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
    console.log('🔔 Received success callback (old format):', JSON.stringify(callbackData, null, 2));

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
    const expectedSign = crypto
        .createHash('md5')
        .update(`${store_id}${invoice_id}${amount}${process.env.MULTICARD_SECRET}`)
        .digest('hex');

    if (sign !== expectedSign) {
        console.error('❌ Invalid signature in success callback');
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

        // Idempotency check
        if (transaction.status === 'paid') {
            console.log(`✅ Transaction already paid: ${invoice_id}`);
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

        // Grant subscription
        const user = await User.findById(transaction.userId);
        if (user) {
            const durationDays = transaction.plan === 'pro' ? 365 : 30;
            await user.grantSubscription(transaction.plan, durationDays, 'multicard');
            console.log(`✅ Subscription granted (success callback): ${user.email}`);
        }

        await transaction.save();

        res.status(200).json({
            success: true,
            message: 'Payment processed successfully'
        });

    } catch (error) {
        console.error('❌ Error processing success callback:', error.message);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
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
    console.log('🔔 Received webhook callback:', JSON.stringify(webhookData, null, 2));

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
                console.log(`📝 Transaction draft: ${invoice_id}`);
                transaction.status = 'pending';
                break;

            case 'progress':
                console.log(`⏳ Transaction in progress: ${invoice_id}`);
                transaction.status = 'pending';
                break;

            case 'success':
                // Idempotency check
                if (transaction.status === 'paid') {
                    console.log(`✅ Transaction already paid: ${invoice_id}`);
                    return res.status(200).json({ success: true });
                }

                console.log(`✅ Transaction successful: ${invoice_id}`);
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
                    console.log(`✅ Subscription granted: ${user.email}`);
                }
                break;

            case 'error':
                console.warn(`❌ Transaction error: ${invoice_id}`);
                transaction.status = 'failed';
                break;

            case 'revert':
                console.warn(`🔄 Transaction refunded: ${invoice_id}`);
                transaction.status = 'refunded';
                transaction.refundedAt = refund_time ? new Date(refund_time) : new Date();
                
                // Revoke subscription if needed
                const userToRevoke = await User.findById(transaction.userId);
                if (userToRevoke) {
                    await userToRevoke.revokeSubscription('multicard');
                    console.log(`🔄 Subscription revoked: ${userToRevoke.email}`);
                }
                break;

            case 'hold':
                console.log(`🔒 Transaction on hold: ${invoice_id}`);
                transaction.status = 'pending';
                break;

            default:
                console.warn(`⚠️ Unknown status: ${status}`);
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
        
        console.log(`🗑️ Deleting invoice: ${uuid}`);

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
 * Create card binding session
 * Returns a URL where user can add their card
 */
const createCardBindingSession = async (req, res) => {
    const { userId, redirectUrl, redirectDeclineUrl } = req.body;

    if (!userId || !redirectUrl || !redirectDeclineUrl) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'ERROR_FIELDS',
                details: 'userId, redirectUrl, and redirectDeclineUrl are required'
            }
        });
    }

    try {
        const user = await User.findById(userId);
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
        const callbackUrl = `${process.env.API_BASE_URL}/api/payments/multicard/card-binding/callback`;

        console.log('💳 Creating card binding session for user:', userId);

        const response = await axios.post(
            `${API_URL}/payment/card/bind`,
            {
                redirect_url: redirectUrl,
                redirect_decline_url: redirectDeclineUrl,
                store_id: storeId,
                callback_url: callbackUrl
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
            
            // Store session info in user document or separate collection
            user.cardBindingSession = {
                sessionId: sessionData.session_id,
                formUrl: sessionData.form_url,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
            };
            await user.save();

            console.log('✅ Card binding session created');
            console.log('   Session ID:', sessionData.session_id);
            console.log('   Form URL:', sessionData.form_url);

            res.json({
                success: true,
                data: {
                    sessionId: sessionData.session_id,
                    formUrl: sessionData.form_url
                }
            });
        } else {
            throw new Error('Failed to create card binding session');
        }

    } catch (error) {
        console.error('❌ Error creating card binding session:', error.message);
        res.status(500).json({
            success: false,
            error: {
                code: 'BINDING_SESSION_ERROR',
                details: error.message
            }
        });
    }
};

/**
 * Handle card binding callback
 * Called by Multicard when card is successfully added
 */
const handleCardBindingCallback = async (req, res) => {
    const callbackData = req.body;
    console.log('💳 Received card binding callback:', JSON.stringify(callbackData, null, 2));

    // The exact format of this callback should be verified with Multicard documentation
    // This is a placeholder implementation
    const { payer_id, card_token, card_pan, ps } = callbackData;

    try {
        // Find user by session_id (payer_id)
        const user = await User.findOne({ 'cardBindingSession.sessionId': payer_id });
        if (!user) {
            console.error(`❌ User not found for session: ${payer_id}`);
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Store card token
        if (!user.savedCards) {
            user.savedCards = [];
        }

        user.savedCards.push({
            cardToken: card_token,
            cardPan: card_pan,
            ps: ps,
            addedAt: new Date()
        });

        // Clear binding session
        user.cardBindingSession = undefined;
        await user.save();

        console.log(`✅ Card bound successfully for user: ${user.email}`);
        console.log(`   Card: ${card_pan}`);
        console.log(`   PS: ${ps}`);

        res.status(200).json({
            success: true,
            message: 'Card bound successfully'
        });

    } catch (error) {
        console.error('❌ Error processing card binding callback:', error.message);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Check card binding status by session ID
 */
const checkCardBindingStatus = async (req, res) => {
    const { sessionId } = req.params;

    try {
        const token = await getAuthToken();
        
        console.log(`🔍 Checking card binding status: ${sessionId}`);

        const response = await axios.get(
            `${API_URL}/payment/card/bind/${sessionId}`,
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
        
        console.log(`🔍 Getting card info by token: ${cardToken.substring(0, 10)}...`);

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
        
        console.log('💳 Adding card by details (PCI DSS method)');
        console.log(`   PAN: ${pan.substring(0, 6)}******${pan.substring(pan.length - 4)}`);

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
            
            console.log('✅ Card added, SMS sent');
            console.log(`   Status: ${cardData.status}`);
            console.log(`   Token: ${cardData.card_token}`);

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
        
        console.log(`✅ Confirming card binding with OTP`);
        console.log(`   Token: ${cardToken.substring(0, 10)}...`);

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
            
            console.log('✅ Card binding confirmed');
            console.log(`   Status: ${cardData.status}`);
            console.log(`   PAN: ${cardData.card_pan}`);

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
        
        console.log(`🔍 Checking PINFL for card: ${pan.substring(0, 6)}******${pan.substring(pan.length - 4)}`);

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
            
            console.log(`   Result: ${matches === true ? '✅ Match' : matches === false ? '❌ No match' : '❓ Unknown'}`);

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
        
        console.log(`🗑️ Deleting card token: ${cardToken.substring(0, 10)}...`);

        const response = await axios.delete(
            `${API_URL}/payment/card/${cardToken}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );

        if (response.data?.success) {
            console.log('✅ Card token deleted successfully');

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
};