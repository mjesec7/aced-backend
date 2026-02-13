\


























































































/**
 * ONE-TIME SCRIPT: Fix pending transactions
 * 
 * Checks all pending Multicard transactions with the Multicard API
 * and updates their status + grants subscriptions for successful ones.
 * 
 * Usage: node scripts/fix_pending_transactions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const MulticardTransaction = require('../models/MulticardTransaction');
const User = require('../models/user');
const { getAuthToken } = require('../controllers/multicardAuth');
const { getDurationFromAmount } = require('../config/subscriptionConfig');

const API_URL = process.env.MULTICARD_API_URL || 'https://api.multicard.uz/api/v1';

async function fixPendingTransactions() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📦 Connected to MongoDB');

        const pendingTxs = await MulticardTransaction.find({
            status: 'pending',
            transactionType: { $ne: 'card_binding' },
            multicardUuid: { $exists: true, $ne: null }
        }).sort({ createdAt: -1 });

        console.log(`🔍 Found ${pendingTxs.length} pending transactions`);

        const token = await getAuthToken();
        let fixed = 0;
        let failed = 0;
        let stillPending = 0;

        for (const tx of pendingTxs) {
            try {
                console.log(`\n--- Checking invoice ${tx.invoiceId} (uuid: ${tx.multicardUuid})`);

                const response = await axios.get(
                    `${API_URL}/payment/invoice/${tx.multicardUuid}`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );

                const paymentData = response.data?.data?.payment;
                const mcStatus = paymentData?.status;

                console.log(`   Multicard status: ${mcStatus}`);

                if (mcStatus === 'success') {
                    tx.status = 'paid';
                    tx.paidAt = new Date(paymentData.payment_time || Date.now());
                    if (paymentData.card_pan) tx.cardPan = paymentData.card_pan;
                    if (paymentData.ps) tx.ps = paymentData.ps;
                    if (paymentData.receipt_url) {
                        tx.paymentDetails = {
                            ...tx.paymentDetails,
                            receiptUrl: paymentData.receipt_url,
                            paymentTime: paymentData.payment_time
                        };
                    }
                    await tx.save();

                    // Grant subscription
                    const user = await User.findById(tx.userId);
                    if (user) {
                        const { durationDays, durationMonths } = getDurationFromAmount(tx.amount);
                        // Only grant if not already pro
                        if (user.subscriptionPlan !== 'pro' || !user.subscriptionExpiryDate || user.subscriptionExpiryDate < new Date()) {
                            await user.grantSubscription(tx.plan || 'pro', durationDays, 'multicard', durationMonths);
                            user.subscriptionAmount = tx.amount;
                            user.lastPaymentDate = new Date();
                            await user.save();
                            console.log(`   ✅ FIXED: Marked paid + granted subscription to ${user.email || user._id}`);
                        } else {
                            console.log(`   ✅ FIXED: Marked paid (user already has active subscription)`);
                        }
                    }
                    fixed++;
                } else if (mcStatus === 'error' || mcStatus === 'revert') {
                    tx.status = mcStatus === 'revert' ? 'refunded' : 'failed';
                    await tx.save();
                    console.log(`   ❌ Marked as ${tx.status}`);
                    failed++;
                } else {
                    console.log(`   ⏳ Still pending (${mcStatus || 'no status'})`);
                    stillPending++;
                }
            } catch (err) {
                console.error(`   ❌ Error checking ${tx.invoiceId}: ${err.message}`);
                stillPending++;
            }
        }

        console.log(`\n========================================`);
        console.log(`✅ Fixed (paid): ${fixed}`);
        console.log(`❌ Failed/refunded: ${failed}`);
        console.log(`⏳ Still pending: ${stillPending}`);
        console.log(`========================================`);

    } catch (error) {
        console.error('Fatal error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('📦 Disconnected from MongoDB');
    }
}

fixPendingTransactions();
