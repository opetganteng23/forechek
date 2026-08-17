const mongoose = require('mongoose')

const PaymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    plan: { type: String, enum: ['pro_monthly', 'pro_yearly', 'institutional'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'IDR' },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded', 'expired'],
      default: 'pending'
    },
    paymentGateway: { type: String, enum: ['midtrans', 'xendit'], default: 'midtrans' },
    gatewayTransactionId: String,
    gatewayOrderId: String,
    paymentMethod: String, // 'bank_transfer', 'gopay', 'qris', dll
    paidAt: Date,
    expiredAt: Date,
    metadata: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
)

module.exports = mongoose.models.Payment || mongoose.model('Payment', PaymentSchema)
