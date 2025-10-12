const express = require('express');
const router = express.Router();
const multicardController = require('../controllers/multicardController');

// Initiate payment - returns checkout URL
router.post('/initiate', multicardController.initiatePayment);

// Webhook endpoint - receives payment notifications from Multicard
router.post('/webhook', multicardController.handleWebhook);

// Success callback - user returns after successful payment
router.get('/callback/success', multicardController.handleSuccessCallback);

// Get invoice information
router.get('/invoice/:invoiceId', multicardController.getInvoiceInfo);

// Cancel invoice
router.delete('/invoice/:invoiceId', multicardController.cancelInvoice);

module.exports = router;