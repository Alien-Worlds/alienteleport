'use strict';

const path = require('node:path');

const FIXTURE_CONFIG = path.join(__dirname, 'fixtures', 'monitor-config.js');

/** Run fn with env vars set (undefined deletes), restoring the originals afterwards. */
function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

module.exports = { FIXTURE_CONFIG, withEnv };
