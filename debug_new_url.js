
const newUrl = "https://checkout.paycom.uz/bT0wejduWXA1M1lKelRneFoyODQzQXY4clFzZndaZHYwO2E9MTAwMDAwMDthYy5Mb2dpbj1hY2VkMTc3MDY3NDI0MjE0M3dndWsyaDtsPWVuO2M9aHR0cHMlM0ElMkYlMkZhcGkuYWNlZC5saXZlJTJGYXBpJTJGcGF5bWVudHMlMkZwYXltZSUyRnJldHVybiUyRnN1Y2Nlc3MlM0Z0cmFuc2FjdGlvbiUzRGFjZWQxNzcwNjc0MjQyMTQyNWR3c3I1a3J2JTI2dXNlcklkJTNESVdLbXNIMVlmZ2NxMUNiNHFrQjJKcUFsNjRRMjtjdD0xNTAwMA==";

try {
    const base64Part = newUrl.split('checkout.paycom.uz/')[1];
    const decoded = Buffer.from(base64Part, 'base64').toString('utf8');

    console.log('--- Decoded Latest URL ---');
    console.log(decoded);

    const parts = decoded.split(';');
    const mPart = parts.find(p => p.startsWith('m='));

    if (mPart) {
        const mVal = mPart.substring(2);
        console.log(`Merchant ID: "${mVal}"`);
        console.log(`Length: ${mVal.length}`);

        const isHex = /^[0-9a-fA-F]+$/.test(mVal);
        console.log(`Is Hex (0-9, A-F) only? ${isHex}`);

        if (!isHex || mVal.length !== 24) {
            console.error('CRITICAL: Merchant ID does not look like a valid PayMe ID (usually 24 hex chars).');
            console.log('This explains the 502 Bad Gateway error - PayMe rejects invalid merchant IDs.');
        } else {
            console.log('Merchant ID format looks correct.');
        }
    } else {
        console.error('Missing m= parameter');
    }

} catch (e) {
    console.error('Error:', e);
}
