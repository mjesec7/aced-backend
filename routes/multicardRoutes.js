const express = require('express');
const router = express.Router();
const multicardController = require('../controllers/multicardController');

// ============================================
// PAYMENT ROUTES
// ============================================

// Payment initiation
router.post('/initiate', multicardController.initiatePayment);

// QR code payment (PaymeGo, ClickPass, Uzum, etc.)
router.put('/payment/:uuid/scanpay', multicardController.processScanPay);

// Webhooks - New format (recommended)
// CORRECT
router.post('/webhook', multicardController.handleWebhook);
// Success callback - Old format (deprecated but kept for compatibility)
router.post('/callback/success', multicardController.handleSuccessCallbackOld);

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
router.post('/card-binding/create', multicardController.createCardBindingSession);

// Card binding callback (from Multicard)
router.post('/card-binding/callback', multicardController.handleCardBindingCallback);

// Check card binding status
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

module.exports = router;
