
const userString = "WUp6VGd4WjI4NEBAM0EldjhyUXNmd1pkdjA7YT0xMjAwMDAwMDA7YWMuTG9naW49YWNlZDE3NzA2NzMwMjE5OTNxYWNhdDM7bD1lbjtjPWh0dHBzJTNBJTJGJTJGYXBpLmFjZWQubGl2ZSUyRmFwaSUyRnBheW1lbnRzJTJGcGF5bWUlMkZyZXR1cm4lMkZzdWNjZXNzJTNGdHJhbnNhY3Rpb24lM0RhY2VkMTc3MDY3MzAyMTk5M2thdGh2ejlycyUyNnVzZXJJZCUzRElXS21zSDFZZmdjcTFDYjRxa0IySnFBbDY0UTI7Y3Q9MTUwMDA";

try {
    const decoded = Buffer.from(userString, 'base64').toString('utf8');
    console.log("Decoded string:", decoded);

    const parts = decoded.split(';');
    console.log("Parts:", parts);
} catch (e) {
    console.error("Error decoding:", e);
}
