'use strict';

// Minimal stand-in for config.js so lib/monitor modules load without real endpoints or keys.
module.exports = {
  eos: { endpoint: 'http://127.0.0.1:1', chainName: 'WAX' },
};
