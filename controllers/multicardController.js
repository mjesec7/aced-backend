const axios = require('axios');
const dotenv = require('dotenv');
const MulticardTransaction = require('../models/multicardTransaction');
const User = require('../models/user'); // Ensure you have a User model

dotenv.config();

const API_URL = process.env.MULTICARD_API_URL;
let authToken = null;
let tokenExpiry = 0;

/**
 * Gets a valid auth token from Multicard, requesting a new one if necessary.
 * @returns {Promise<string>} The JWT token.
 */
const getAuthToken = async () => {
    // If we have a token and it's not expired, reuse it.
    if (authToken && Date.now() < tokenExpiry) {
        return authToken;
    }
    try {
        console.log('Refreshing Multicard auth token...');
        const response = await axios.post(`${API_URL}/auth`, {
            application_id: process.env.MULTICARD_APPLICATION_ID,
            secret: process.env.MULTICARD_SECRET,
        });

        if (response.data && response.data.success) {
            authToken = response.data.data.token;
            // Set expiry to 5 minutes before the actual expiry for a safety margin.
            tokenExpiry = new Date(response.data.data.expiry).getTime() - (5 * 60 * 1000);
            return authToken;
        }
        throw new Error('Multicard authentication failed.');
    } catch (error) {
        console.error('❌ Error fetching Multicard token:', error.response ? error.response.data : error.message);
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
    const { userId, plan, amount, ofd } = req.body;

    if (!userId || !plan || !amount || !ofd) {
        return res.status(400).json({ success: false, error: 'userId, plan, amount, and ofd are required.' });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const token = await getAuthToken();
        const invoiceId = `aced_${plan}_${userId}_${Date.now()}`;
        const callbackUrl = `${process.env.API_BASE_URL}/api/payments/multicard/callback`;
        const storeId = isNaN(parseInt(process.env.MULTICARD_STORE_ID))
            ? process.env.MULTICARD_STORE_ID
            : parseInt(process.env.MULTICARD_STORE_ID);

        const payload = {
            store_id: storeId,
            amount,
            invoice_id: invoiceId,
            callback_url: callbackUrl,
            return_url: `${process.env.FRONTEND_URL}/payment-success`,
            return_error_url: `${process.env.FRONTEND_URL}/payment-failed`,
            lang: 'ru',
            ofd,
        };

        const response = await axios.post(`${API_URL}/payment/invoice`, payload, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.data || !response.data.success) {
            throw new Error('Failed to create Multicard invoice: ' + (response.data.error?.details || 'Unknown error'));
        }

        const multicardResponse = response.data.data;
        
        // Create a pending transaction record in your database
        const transaction = new MulticardTransaction({
            userId,
            invoiceId,
            amount,
            plan,
            status: 'pending',
            multicardUuid: multicardResponse.uuid,
        });
        await transaction.save();

        res.json({
            success: true,
            checkoutUrl: multicardResponse.checkout_url,
        });

    } catch (error) {
        console.error('❌ Error initiating Multicard payment:', error.message);
        res.status(500).json({ success: false, error: 'Failed to initiate payment.' });
    }
};

/**
 * Controller function to handle the incoming webhook from Multicard.
 */
exports.handleCallback = async (req, res) => {
    const callbackData = req.body;
    console.log('🔔 Received Multicard callback:', JSON.stringify(callbackData, null, 2));

    const { payment } = callbackData;
    if (!payment || !payment.invoice_id) {
        console.error('❌ Invalid callback data: invoice_id is missing.');
        return res.status(400).send('Invalid callback data: missing invoice_id');
    }

    try {
        // Find the transaction using your internal invoice ID
        const transaction = await MulticardTransaction.findOne({ invoiceId: payment.invoice_id });
        if (!transaction) {
            console.error(`❌ Transaction not found for invoice_id: ${payment.invoice_id}`);
            return res.status(404).send('Transaction not found');
        }

        // Idempotency check: If already paid, do nothing.
        if (transaction.status === 'paid') {
            console.log(`✅ Transaction already processed: ${payment.invoice_id}`);
            return res.status(200).send('OK');
        }

        // Store the full callback payload for auditing
        transaction.callbackPayload = callbackData;

        if (payment.status === 'success') {
            transaction.status = 'paid';
            // Find the user and grant them their subscription/purchase
            const user = await User.findById(transaction.userId);
            if (user) {
                const durationDays = transaction.plan === 'pro' ? 365 : 30; // Customize as needed
                await user.grantSubscription(transaction.plan, durationDays, 'multicard');
                console.log(`✅ Subscription granted for plan "${transaction.plan}" to user ${user.email}.`);
            }
        } else {
            transaction.status = 'failed';
            console.warn(`🔶 Payment was not successful for invoice_id: ${payment.invoice_id}, status: ${payment.status}`);
        }

        await transaction.save();
        
        // Always return a 200 OK to Multicard to prevent retries
        res.status(200).send('OK');

    } catch (error) {
        console.error('❌ Error processing callback:', error.message);
        res.status(500).send('Internal Server Error');
    }
};