'use strict'
module.exports = {
  ...require('./src/normalize'),
  ...require('./src/compare'),
  ...require('./src/search'),
  ...require('./src/verify'),
  ...require('./src/citations'),
  ...require('./src/claims'),
  ...require('./src/library'),
  ...require('./src/tools'),
  ...require('./src/providers/adapters'),
  ...require('./src/providers/http'),
  ...require('./src/providers/fixture'),
  ...require('./src/providers/index'),
  ...require('./src/fixtures/corpus')
}
