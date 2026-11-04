const mongoose = require('mongoose');

// One row per reset request. Only a hash of the token is stored, so a copy of the database cannot be used to take over an account.
const passwordResetSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token_hash: { type: String, required: true, unique: true },
  expires_at: { type: Date, required: true },
  used_at: { type: Date, default: null }
}, { timestamps: true });

// MongoDB removes the row by itself some time after it expires.
passwordResetSchema.index({ expires_at: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
