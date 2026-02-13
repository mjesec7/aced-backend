const Module = require('module');
const originalRequire = Module.prototype.require;
const crypto = require('crypto');
const dotenv = require('dotenv');

// Load env
dotenv.config();

// FORCE SET ENV VAR FOR TEST
process.env.MULTICARD_SECRET = 'multicard_secret_key';

// MOCK DEPENDENCIES
const mocks = {
    '../models/MulticardTransaction': {
        findOne: async ({ invoiceId }) => {
            console.log(`[MockDB] Searching for transaction: ${invoiceId}`);
            return {
                status: 'pending',
                save: async () => console.log('[MockDB] Transaction saved'),
                paymentDetails: {}
            };
        }
    },
    '../models/user': {
        findById: async () => ({
            grantSubscription: async () => console.log('[MockDB] Subscription granted'),
            save: async () => console.log('[MockDB] User saved')
        })
    },
    './multicardAuth': { getAuthToken: async () => 'mock-token' },
    '../config/subscriptionConfig': { getDurationFromAmount: () => ({ durationDays: 30 }) }
};

// Override require to serve mocks
Module.prototype.require = function (path) {
    if (mocks[path]) {
        return mocks[path];
    }
    return originalRequire.apply(this, arguments);
};

// Import Controller (after mocking)
const controller = require('./controllers/multicardController');

// TEST CONFIGURATION
const SECRET = process.env.MULTICARD_SECRET || 'multicard_secret_key';
const STORE_ID = 2660;
const INVOICE_ID = `ACED_PRO_${Date.now()}`;
const AMOUNT = 1000000;

// Construct Valid MD5 Signature
const rawString = `${STORE_ID}${INVOICE_ID}${AMOUNT}${SECRET}`;
const validSignature = crypto.createHash('md5').update(rawString).digest('hex');

// Construct Invalid Signature (SHA1 mismatch)
const invalidSignature = crypto.createHash('sha1').update(rawString).digest('hex');

// Mock Request/Response
const createReqRes = (payload) => {
    const req = {
        body: payload,
        method: 'POST',
        headers: {},
        originalUrl: '/api/payments/multicard/webhook',
        ip: '127.0.0.1'
    };

    const res = {
        statusCode: 200,
        headers: {},
        status: function (code) {
            this.statusCode = code;
            return this;
        },
        json: function (data) {
            console.log(`[Response ${this.statusCode}]`, data);
            this.body = data;
            return this;
        }
    };

    return { req, res };
};

async function runTests() {
    console.log('--- STARTING WEBHOOK VERIFICATION TESTS ---\n');

    // TEST 1: Valid MD5 Signature
    console.log('TEST 1: Valid MD5 Signature');
    const validPayload = {
        store_id: STORE_ID,
        amount: AMOUNT,
        invoice_id: INVOICE_ID,
        uuid: 'test-uuid',
        sign: validSignature
    };
    const { req: req1, res: res1 } = createReqRes(validPayload);

    await controller.handleWebhook(req1, res1);

    if (res1.statusCode === 200 && res1.body.success) {
        console.log('✅ PASS: Valid signature accepted\n');
    } else {
        console.error('❌ FAIL: Valid signature rejected\n');
    }

    // TEST 2: Invalid Signature
    console.log('TEST 2: Invalid Signature');
    const invalidPayload = {
        store_id: STORE_ID,
        amount: AMOUNT,
        invoice_id: INVOICE_ID,
        uuid: 'test-uuid',
        sign: invalidSignature
    };
    const { req: req2, res: res2 } = createReqRes(invalidPayload);

    await controller.handleWebhook(req2, res2);

    if (res2.statusCode === 400 && !res2.body.success) {
        console.log('✅ PASS: Invalid signature rejected\n');
    } else {
        console.error('❌ FAIL: Invalid signature accepted or wrong status\n');
    }
}

runTests();
