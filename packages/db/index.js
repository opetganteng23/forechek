const mongoose = require('mongoose')
const dbConnect = require('./connection')

const User = require('./models/User')
const Project = require('./models/Project')
const ManuscriptVersion = require('./models/ManuscriptVersion')
const Message = require('./models/Message')
const UsageLedger = require('./models/UsageLedger')
const AiUsageLog = require('./models/AiUsageLog')
const Reference = require('./models/Reference')
const ReferenceCandidate = require('./models/ReferenceCandidate')
const VenueProfile = require('./models/VenueProfile')
const ReadinessReport = require('./models/ReadinessReport')
// Model lama (alur analisis sebelum Tahap 2); akan dipensiunkan bertahap.
const Manuscript = require('./models/Manuscript')
const Analysis = require('./models/Analysis')
const Journal = require('./models/Journal')
const Payment = require('./models/Payment')
const KumCalculation = require('./models/KumCalculation')

const newObjectId = () => new mongoose.Types.ObjectId()

module.exports = {
  dbConnect,
  newObjectId,
  User,
  Project,
  ManuscriptVersion,
  Message,
  UsageLedger,
  AiUsageLog,
  Reference,
  ReferenceCandidate,
  VenueProfile,
  ReadinessReport,
  Manuscript,
  Analysis,
  Journal,
  Payment,
  KumCalculation
}
