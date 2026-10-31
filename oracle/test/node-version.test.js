'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Oct 2026 Node.js security release (Brotli RCE, DNS/TLS verification) is fixed in 24.22.1.
// Only the 24 line is supported: a higher major does not imply the fixes are present
// (26.x was patched in 26.12.1, so 26.0.0 is vulnerable and 25.x is not in the advisory).
const PATCHED_FLOOR = [24, 22, 1];

const parse = (v) => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v);
  assert.ok(m, `unparseable version: ${JSON.stringify(v)}`);
  return m.slice(1).map(Number);
};

const atLeast = (a, b) => {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
};

/** True when version is >= floor and on the same major (caret range semantics). */
const satisfiesCaret = (version, floor) => version[0] === floor[0] && atLeast(version, floor);

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const enginesFloor = () => {
  const { engines } = JSON.parse(read('package.json'));
  const m = /^\^(\d+\.\d+\.\d+)$/.exec(engines.node);
  assert.ok(m, `engines.node must be a "^x.y.z" range on one major, got ${JSON.stringify(engines.node)}`);
  return parse(m[1]);
};

const pinnedVersion = () => {
  const line = read('.tool-versions')
    .split('\n')
    .find((l) => l.startsWith('nodejs '));
  assert.ok(line, '.tool-versions has no nodejs entry');
  return parse(line.split(/\s+/)[1]);
};

test('package.json engines.node is a caret range at or above the patched release', () => {
  assert.ok(satisfiesCaret(enginesFloor(), PATCHED_FLOOR), 'engines.node allows vulnerable or unverified Node');
});

test('.tool-versions pin satisfies the patched release range', () => {
  assert.ok(satisfiesCaret(pinnedVersion(), PATCHED_FLOOR), '.tool-versions pins vulnerable or unverified Node');
});

test('.tool-versions pin satisfies engines.node', () => {
  assert.ok(satisfiesCaret(pinnedVersion(), enginesFloor()), 'pin is outside the engines range');
});

test('running Node satisfies the patched release range', () => {
  assert.ok(satisfiesCaret(parse(process.version), PATCHED_FLOOR), `running vulnerable or unverified Node ${process.version}`);
});

test('premise: the range check rejects vulnerable and unverified versions', () => {
  const ok = (v) => satisfiesCaret(parse(v), PATCHED_FLOOR);
  assert.strictEqual(ok('24.18.0'), false, 'older 24.x');
  assert.strictEqual(ok('23.9.0'), false, 'lower major');
  assert.strictEqual(ok('25.0.0'), false, 'unverified higher major');
  assert.strictEqual(ok('26.0.0'), false, 'higher major predating its own fix');
  assert.strictEqual(ok('26.12.1'), false, 'patched 26.x is not verified here');
  assert.strictEqual(ok('24.22.0'), false, 'one patch below the floor');
  assert.strictEqual(ok('24.22.1'), true);
  assert.strictEqual(ok('24.99.9'), true);
});
