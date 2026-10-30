'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Oct 2026 Node.js security release (Brotli RCE, DNS/TLS verification) is fixed in 24.22.1.
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

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('package.json engines.node floor is not below the patched release', () => {
  const { engines } = JSON.parse(read('package.json'));
  const m = /^>=\s*(\d+\.\d+\.\d+)$/.exec(engines.node);
  assert.ok(m, `engines.node must be a ">=x.y.z" range, got ${JSON.stringify(engines.node)}`);
  assert.ok(atLeast(parse(m[1]), PATCHED_FLOOR), `engines.node ${engines.node} allows vulnerable Node`);
});

test('.tool-versions nodejs pin is not below the patched release', () => {
  const line = read('.tool-versions')
    .split('\n')
    .find((l) => l.startsWith('nodejs '));
  assert.ok(line, '.tool-versions has no nodejs entry');
  const pinned = line.split(/\s+/)[1];
  assert.ok(atLeast(parse(pinned), PATCHED_FLOOR), `.tool-versions pins vulnerable Node ${pinned}`);
});

test('.tool-versions pin satisfies engines.node', () => {
  const { engines } = JSON.parse(read('package.json'));
  const floor = parse(/(\d+\.\d+\.\d+)/.exec(engines.node)[1]);
  const pinned = parse(/^nodejs\s+(\S+)/m.exec(read('.tool-versions'))[1]);
  assert.ok(atLeast(pinned, floor), 'pin is below engines floor');
});

test('running Node is not below the patched release', () => {
  assert.ok(atLeast(parse(process.version), PATCHED_FLOOR), `running vulnerable Node ${process.version}`);
});

test('premise: version comparison rejects a vulnerable version', () => {
  assert.strictEqual(atLeast(parse('24.18.0'), PATCHED_FLOOR), false);
  assert.strictEqual(atLeast(parse('24.22.1'), PATCHED_FLOOR), true);
  assert.strictEqual(atLeast(parse('26.12.1'), PATCHED_FLOOR), true);
});
