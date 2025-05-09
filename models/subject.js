const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // Russian name like "Математика"
  icon: { type: String, default: null },                // Optional icon
  levels: { type: Array, default: [] },                 // Nested structure support
  createdAt: { type: Date, default: Date.now }          // Timestamps for sorting
});

module.exports = mongoose.model('Subject', subjectSchema);
