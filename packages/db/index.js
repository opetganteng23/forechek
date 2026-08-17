const dbConnect = require('./connection')

const User = require('./models/User')
const Manuscript = require('./models/Manuscript')
const Analysis = require('./models/Analysis')
const Journal = require('./models/Journal')
const Payment = require('./models/Payment')
const KumCalculation = require('./models/KumCalculation')

module.exports = {
  dbConnect,
  User,
  Manuscript,
  Analysis,
  Journal,
  Payment,
  KumCalculation
}
