
const dotenv = require('dotenv');
dotenv.config();

const merchantId = process.env.PAYME_MERCHANT_ID || 'TEST_MERCHANT_ID';
console.log(`Merchant ID Length: ${merchantId.length}`);
console.log(`Merchant ID First char code: ${merchantId.charCodeAt(0)}`);
console.log(`Merchant ID (safe view): ${merchantId.substring(0, 5)}...`);

const userId = 'aced1770673021993qacat3';
const finalAmount = 120000000;

const paramString = [
    `m=${merchantId}`,
    `ac.Login=${userId}`,
    `a=${finalAmount}`,
    `l=en`
].join(';');

console.log('--- Generated Param String ---');
console.log(paramString);

const base64Params = Buffer.from(paramString, 'utf8').toString('base64');
console.log('--- Base64 Params ---');
console.log(base64Params);

// Check if m= is present
if (!paramString.startsWith('m=')) {
    console.error('CRITICAL: m= is missing from start of string!');
} else {
    console.log('Check: m= is present.');
}

// Decode user string to compare
const userString = "WUp6VGd4WjI4NEBAM0EldjhyUXNmd1pkdjA7YT0xMjAwMDAwMDA7YWMuTG9naW49YWNlZDE3NzA2NzMwMjE5OTNxYWNhdDM7bD1lbjtjPWh0dHBzJTNBJTJGJTJGYXBpLmFjZWQubGl2ZSUyRmFwaSUyRnBheW1lbnRzJTJGcGF5bWUlMkZyZXR1cm4lMkZzdWNjZXNzJTNGdHJhbnNhY3Rpb24lM0RhY2VkMTc3MDY3MzAyMTk5M2thdGh2ejlycyUyNnVzZXJJZCUzRElXS21zSDFZZmdjcTFDYjRxa0IySnFBbDY0UTI7Y3Q9MTUwMDA";
const decodedUser = Buffer.from(userString, 'base64').toString('utf8');
console.log('--- Decoded User String ---');
console.log(decodedUser);
