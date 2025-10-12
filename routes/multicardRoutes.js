const express = require('express');
const router = express.Router();
const multicardController = require('../controllers/multicardController');

// This route starts the payment process
// Your frontend will call this to get the checkout URL
router.post('/initiate', multicardController.initiatePayment);

// This is the webhook endpoint that Multicard will call
router.post('/callback', multicardController.handleCallback);

module.exports = router;