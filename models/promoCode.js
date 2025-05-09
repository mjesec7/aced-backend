// backend/models/promoCode.js
const mongoose = require("mongoose");

const promoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("PromoCode", promoCodeSchema);
