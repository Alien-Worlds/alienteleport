'use strict';

function parseFiniteInt(value, name, { min, max } = {}) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${name} is required`);
  }
  const raw = String(value).trim();
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`Invalid ${name}: ${JSON.stringify(value)} (expected integer)`);
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${name}: ${JSON.stringify(value)}`);
  }
  if (min !== undefined && n < min) {
    throw new Error(`${name} must be >= ${min} (got ${n})`);
  }
  if (max !== undefined && n > max) {
    throw new Error(`${name} must be <= ${max} (got ${n})`);
  }
  return n;
}

function parseOptionalFiniteInt(value, name, bounds) {
  if (value === undefined || value === null || value === '') return undefined;
  return parseFiniteInt(value, name, bounds);
}

function parseArgs(argv) {
  const args = {
    once: false,
    json: false,
    allChains: true,
    interval: 300,
    sigThreshold: 3,
    receiptThreshold: 5,
    minAgeSec: 120,
    // Items older than this are "historical" — shown collapsed, don't raise primary alarm
    historicalAgeSec: 365 * 24 * 3600,
    pages: 100,
    chainId: null,
    hyperion: process.env.HYPERION || '',
    statusPort: 9090,
    statusBind: process.env.STATUS_BIND || '0.0.0.0',
  };

  try {
    const envInterval = parseOptionalFiniteInt(process.env.INTERVAL_SEC, 'INTERVAL_SEC', { min: 1 });
    if (envInterval !== undefined) args.interval = envInterval;

    const envSig = parseOptionalFiniteInt(process.env.SIG_THRESHOLD, 'SIG_THRESHOLD', { min: 1 });
    if (envSig !== undefined) args.sigThreshold = envSig;

    const envReceipt = parseOptionalFiniteInt(process.env.RECEIPT_THRESHOLD, 'RECEIPT_THRESHOLD', {
      min: 1,
    });
    if (envReceipt !== undefined) args.receiptThreshold = envReceipt;

    const envMinAge = parseOptionalFiniteInt(process.env.MIN_AGE_SEC, 'MIN_AGE_SEC', { min: 0 });
    if (envMinAge !== undefined) args.minAgeSec = envMinAge;

    const envHist = parseOptionalFiniteInt(process.env.HISTORICAL_AGE_SEC, 'HISTORICAL_AGE_SEC', {
      min: 3600,
    });
    if (envHist !== undefined) args.historicalAgeSec = envHist;

    const envPages = parseOptionalFiniteInt(process.env.PAGES, 'PAGES', { min: 1 });
    if (envPages !== undefined) args.pages = envPages;

    const envPort = parseOptionalFiniteInt(process.env.STATUS_PORT, 'STATUS_PORT', {
      min: 0,
      max: 65535,
    });
    if (envPort !== undefined) args.statusPort = envPort;

    const chainEnv = process.env.CHAIN_ID;
    if (chainEnv !== undefined && chainEnv !== '' && chainEnv !== 'all') {
      args.chainId = parseFiniteInt(chainEnv, 'CHAIN_ID', { min: 0 });
      args.allChains = false;
    }

    for (let i = 2; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--once') args.once = true;
      else if (a === '--json') args.json = true;
      else if (a === '--watch') args.once = false;
      else if (a === '--all-chains') {
        args.allChains = true;
        args.chainId = null;
      } else if (a === '--interval' && argv[i + 1]) {
        args.interval = parseFiniteInt(argv[++i], '--interval', { min: 1 });
      } else if (a === '--sig-threshold' && argv[i + 1]) {
        args.sigThreshold = parseFiniteInt(argv[++i], '--sig-threshold', { min: 1 });
      } else if (a === '--receipt-threshold' && argv[i + 1]) {
        args.receiptThreshold = parseFiniteInt(argv[++i], '--receipt-threshold', { min: 1 });
      } else if (a === '--min-age' && argv[i + 1]) {
        args.minAgeSec = parseFiniteInt(argv[++i], '--min-age', { min: 0 });
      } else if (a === '--historical-age' && argv[i + 1]) {
        args.historicalAgeSec = parseFiniteInt(argv[++i], '--historical-age', { min: 3600 });
      } else if (a === '--pages' && argv[i + 1]) {
        args.pages = parseFiniteInt(argv[++i], '--pages', { min: 1 });
      } else if (a === '--port' && argv[i + 1]) {
        args.statusPort = parseFiniteInt(argv[++i], '--port', { min: 0, max: 65535 });
      } else if (a === '--bind' && argv[i + 1]) {
        args.statusBind = argv[++i];
      } else if (a === '--chain-id' && argv[i + 1]) {
        const v = argv[++i];
        if (v === 'all') {
          args.chainId = null;
          args.allChains = true;
        } else {
          args.chainId = parseFiniteInt(v, '--chain-id', { min: 0 });
          args.allChains = false;
        }
      } else if (a === '--hyperion' && argv[i + 1]) {
        args.hyperion = argv[++i];
      } else if (a === '--help' || a === '-h') {
        console.log(`Usage: CONFIG=./config.js node monitor-teleports.js [options]

Options:
  --once                  Single scan, then exit with status code
  --watch                 Continuous mode (default)
  --interval <sec>        Seconds between scans (default 300)
  --json                  One JSON object per scan
  --all-chains            Do not filter by chain_id (default)
  --chain-id <n|all>      Filter to one chain_id
  --sig-threshold <n>     WAX→EVM signature quorum (default 3)
  --receipt-threshold <n> EVM→WAX confirmations (default 5)
  --min-age <sec>         Ignore items newer than this (default 120)
  --historical-age <sec>  Age above which items are "historical" (default 1y)
  --pages <n>             Max pages of 100 rows per table (default 100)
  --port <n>              HTTP status port (default 9090; 0 disables)
  --bind <addr>           HTTP bind address (default 0.0.0.0)
  --hyperion <url>        Hyperion base for block_num hints
`);
        process.exit(0);
      } else if (a.startsWith('--')) {
        throw new Error(`Unknown option: ${a}`);
      }
    }
  } catch (e) {
    console.error(`Config error: ${e.message}`);
    process.exit(3);
  }

  return args;
}

module.exports = { parseArgs, parseFiniteInt, parseOptionalFiniteInt };
