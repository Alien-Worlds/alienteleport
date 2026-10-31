'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseArgs, parseFiniteInt, parseOptionalFiniteInt } = require('../lib/monitor/args');
const { withEnv } = require('./helpers');

const CLEAN_ENV = {
  HYPERION: undefined,
  STATUS_BIND: undefined,
  INTERVAL_SEC: undefined,
  SIG_THRESHOLD: undefined,
  RECEIPT_THRESHOLD: undefined,
  MIN_AGE_SEC: undefined,
  HISTORICAL_AGE_SEC: undefined,
  PAGES: undefined,
  STATUS_PORT: undefined,
  CHAIN_ID: undefined,
};

const parse = (argv = [], env = {}) => withEnv({ ...CLEAN_ENV, ...env }, () => parseArgs(['node', 'monitor', ...argv]));

/** parseArgs exits 3 on bad config; capture that instead of killing the test runner. */
function parseExpectingExit(argv, env = {}) {
  const realExit = process.exit;
  const realError = console.error;
  let code;
  let message = '';
  process.exit = (c) => {
    code = c;
    throw new Error('__exit__');
  };
  console.error = (m) => {
    message = String(m);
  };
  try {
    parse(argv, env);
  } catch (e) {
    if (e.message !== '__exit__') throw e;
  } finally {
    process.exit = realExit;
    console.error = realError;
  }
  return { code, message };
}

test('parseFiniteInt accepts integers and trims whitespace', () => {
  assert.strictEqual(parseFiniteInt('42', 'X'), 42);
  assert.strictEqual(parseFiniteInt(' 7 ', 'X'), 7);
  assert.strictEqual(parseFiniteInt(0, 'X'), 0);
  assert.strictEqual(parseFiniteInt('-3', 'X'), -3);
});

test('parseFiniteInt rejects empty, non-integer and out-of-range values', () => {
  assert.throws(() => parseFiniteInt(undefined, 'X'), /X is required/);
  assert.throws(() => parseFiniteInt('', 'X'), /X is required/);
  assert.throws(() => parseFiniteInt('1.5', 'X'), /Invalid X/);
  assert.throws(() => parseFiniteInt('12abc', 'X'), /Invalid X/);
  assert.throws(() => parseFiniteInt('1e3', 'X'), /Invalid X/);
  assert.throws(() => parseFiniteInt('0', 'X', { min: 1 }), /X must be >= 1/);
  assert.throws(() => parseFiniteInt('70000', 'X', { max: 65535 }), /X must be <= 65535/);
  assert.strictEqual(parseFiniteInt('65535', 'X', { max: 65535 }), 65535);
});

test('parseOptionalFiniteInt returns undefined for unset values', () => {
  assert.strictEqual(parseOptionalFiniteInt(undefined, 'X'), undefined);
  assert.strictEqual(parseOptionalFiniteInt(null, 'X'), undefined);
  assert.strictEqual(parseOptionalFiniteInt('', 'X'), undefined);
  assert.strictEqual(parseOptionalFiniteInt('5', 'X'), 5);
});

test('parseArgs defaults', () => {
  const a = parse();
  assert.strictEqual(a.once, false);
  assert.strictEqual(a.json, false);
  assert.strictEqual(a.allChains, true);
  assert.strictEqual(a.chainId, null);
  assert.strictEqual(a.interval, 300);
  assert.strictEqual(a.sigThreshold, 3);
  assert.strictEqual(a.receiptThreshold, 5);
  assert.strictEqual(a.minAgeSec, 120);
  assert.strictEqual(a.historicalAgeSec, 365 * 24 * 3600);
  assert.strictEqual(a.pages, 100);
  assert.strictEqual(a.statusPort, 9090);
});

test('parseArgs reads environment variables', () => {
  const a = parse([], {
    INTERVAL_SEC: '60',
    SIG_THRESHOLD: '4',
    RECEIPT_THRESHOLD: '6',
    MIN_AGE_SEC: '0',
    PAGES: '5',
    STATUS_PORT: '0',
    STATUS_BIND: '127.0.0.1',
    HYPERION: 'https://hyperion.example',
    CHAIN_ID: '2',
  });
  assert.strictEqual(a.interval, 60);
  assert.strictEqual(a.sigThreshold, 4);
  assert.strictEqual(a.receiptThreshold, 6);
  assert.strictEqual(a.minAgeSec, 0);
  assert.strictEqual(a.pages, 5);
  assert.strictEqual(a.statusPort, 0);
  assert.strictEqual(a.statusBind, '127.0.0.1');
  assert.strictEqual(a.hyperion, 'https://hyperion.example');
  assert.strictEqual(a.chainId, 2);
  assert.strictEqual(a.allChains, false);
});

test('CHAIN_ID=all keeps all-chains mode', () => {
  const a = parse([], { CHAIN_ID: 'all' });
  assert.strictEqual(a.chainId, null);
  assert.strictEqual(a.allChains, true);
});

test('command-line flags override environment', () => {
  const a = parse(['--once', '--json', '--interval', '10', '--chain-id', '1', '--port', '8080'], {
    INTERVAL_SEC: '60',
    CHAIN_ID: '2',
  });
  assert.strictEqual(a.once, true);
  assert.strictEqual(a.json, true);
  assert.strictEqual(a.interval, 10);
  assert.strictEqual(a.chainId, 1);
  assert.strictEqual(a.allChains, false);
  assert.strictEqual(a.statusPort, 8080);
});

test('--all-chains and --chain-id all reset a chain filter', () => {
  assert.strictEqual(parse(['--all-chains'], { CHAIN_ID: '2' }).chainId, null);
  assert.strictEqual(parse(['--chain-id', 'all'], { CHAIN_ID: '2' }).allChains, true);
});

test('--watch after --once returns to continuous mode', () => {
  assert.strictEqual(parse(['--once', '--watch']).once, false);
});

test('bad config exits with code 3 and a Config error message', () => {
  for (const [argv, env, pattern] of [
    [['--bogus'], {}, /Unknown option: --bogus/],
    [['--interval', '0'], {}, /--interval must be >= 1/],
    [['--port', '99999'], {}, /--port must be <= 65535/],
    [['--historical-age', '60'], {}, /--historical-age must be >= 3600/],
    [[], { SIG_THRESHOLD: 'abc' }, /Invalid SIG_THRESHOLD/],
    [[], { HISTORICAL_AGE_SEC: '10' }, /HISTORICAL_AGE_SEC must be >= 3600/],
    [[], { CHAIN_ID: '-1' }, /CHAIN_ID must be >= 0/],
  ]) {
    const { code, message } = parseExpectingExit(argv, env);
    assert.strictEqual(code, 3, `${argv.join(' ')} ${JSON.stringify(env)} should exit 3`);
    assert.match(message, pattern);
  }
});

test('remaining flags set their values', () => {
  const a = parse([
    '--sig-threshold', '4',
    '--receipt-threshold', '6',
    '--min-age', '30',
    '--historical-age', '7200',
    '--pages', '9',
    '--bind', '127.0.0.1',
    '--hyperion', 'https://h.example',
  ]);
  assert.strictEqual(a.sigThreshold, 4);
  assert.strictEqual(a.receiptThreshold, 6);
  assert.strictEqual(a.minAgeSec, 30);
  assert.strictEqual(a.historicalAgeSec, 7200);
  assert.strictEqual(a.pages, 9);
  assert.strictEqual(a.statusBind, '127.0.0.1');
  assert.strictEqual(a.hyperion, 'https://h.example');
});

test('hyperion defaults to empty when neither env nor flag is given', () => {
  assert.strictEqual(parse().hyperion, '');
});

test('--help prints usage and exits 0', () => {
  const realExit = process.exit;
  const realLog = console.log;
  const realError = console.error;
  let code;
  let out = '';
  // parseArgs wraps everything in try/catch, so only the first exit call is the real one.
  process.exit = (c) => {
    if (code === undefined) code = c;
    throw new Error('__exit__');
  };
  console.log = (m) => {
    out += m;
  };
  console.error = () => {};
  try {
    parse(['--help']);
  } catch (e) {
    if (e.message !== '__exit__') throw e;
  } finally {
    process.exit = realExit;
    console.log = realLog;
    console.error = realError;
  }
  assert.strictEqual(code, 0);
  assert.match(out, /Usage: CONFIG=/);
  assert.match(out, /--sig-threshold/);
});
