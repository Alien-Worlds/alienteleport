'use strict';

const path = require('path');
const os = require('os');
const { JsonRpc } = require('eosjs');
const fetch = require('node-fetch');

const configFile = process.env.CONFIG || './config';
const config = require(path.resolve(configFile));
const rpc = new JsonRpc(config.eos.endpoint, { fetch });

/** Antelope L1 for this deployment (Alien Worlds TLM bridge is WAX). */
const ANTELOPE_CHAIN = process.env.ANTELOPE_CHAIN || config.eos.chainName || 'WAX';
const PM2_LOG_DIR = process.env.PM2_LOG_DIR || path.join(os.homedir(), '.pm2', 'logs');

/** Shared live state for the HTTP API (never holds secrets). */
const live = {
  started_at: new Date().toISOString(),
  last_scan_at: null,
  last_scan_duration_ms: null,
  last_readers_at: null,
  last_exit_hint: null,
  last_error: null,
  scan_count: 0,
  report: null,
  scanning: false,
  refreshing_readers: false,
};

module.exports = {
  configFile,
  config,
  rpc,
  ANTELOPE_CHAIN,
  PM2_LOG_DIR,
  live,
};
