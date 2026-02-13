const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

const API_URL = 'http://localhost:5000/api/payments/multicard/webhook';
const SECRET = process.env.MULTICARD_SECRET || 'multicard_secret_key'; // Ensure this matches your .env or is set here for testing if safe
const STORE_ID = 2660;

// Example payload from user request
const payload = {
    store_id: STORE_ID,
    amount: 1000000,
    invoice_id: `ACED_PRO_${Date.now()}`,
    invoice_uuid: "6037d247-08a8-11f1-bf4a-00505680eaf6",
    billing_id: null,
    payment_time: "2026-02-13 11:51:23",
    phone: "998970096980",
    card_pan: "986010******3740",
    card_token: "sH89nPphhjjRZZuNd1qdvg",
    ps: "humo",
    uuid: "6037d247-08a8-11f1-bf4a-00505680eaf6",
    receipt_url: "https://checkout.multicard.uz/check/6037d247-08a8-11f1-bf4a-00505680eaf6"
};

// Generate MD5 signature: {store_id}{invoice_id}{amount}{secret}
const rawString = `${payload.store_id}${payload.invoice_id}${payload.amount}${SECRET}`;
const sign = crypto.createHash('md5').update(rawString).digest('hex');

payload.sign = sign;

console.log('--- Test Configuration ---');
console.log('Target URL:', API_URL);
console.log('Secret (masked):', SECRET.slice(0, 3) + '***');
console.log('Raw String:', rawString);
console.log('Signature:', sign);
console.log('Payload:', JSON.stringify(payload, null, 2));

async function runTest() {
    try {
        console.log('\n--- Sending Request ---');
        const response = await axios.post(API_URL, payload);
        console.log('\n✅ Success!');
        console.log('Status:', response.status);
        console.log('Data:', response.data);
    } catch (error) {
        console.error('\n❌ Error!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error('Message:', error.message);
        }
    }
}

runTest();
