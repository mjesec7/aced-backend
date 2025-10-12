const axios = require('axios');
const dotenv = require('dotenv');
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
exports.initiatePayment = async (req, res) => {
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
exports.handleSuccessCallback = async (req, res) => {
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
exports.handleWebhook = async (req, res) => {
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
exports.getInvoiceInfo = async (req, res) => {
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
exports.cancelInvoice = async (req, res) => {
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
exports.testConnection = async (req, res) => {
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