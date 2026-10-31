'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadEthBlock, saveEthBlock, nextWindow, createWaxCursor, rewindWaxStart } = require('../lib/oracle/cursor');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-cursor-')), 'cursor');

test('loadEthBlock: missing file means latest', () => {
  assert.strictEqual(loadEthBlock(tmp()), 'latest');
});

test('loadEthBlock: saved block is rewound by 50', () => {
  const f = tmp();
  fs.writeFileSync(f, '1000');
  assert.strictEqual(loadEthBlock(f), 950);
});

test('loadEthBlock: corrupt content means latest', () => {
  const f = tmp();
  fs.writeFileSync(f, 'not a number');
  assert.strictEqual(loadEthBlock(f), 'latest');
});

test('saveEthBlock then loadEthBlock round-trips with the rewind', () => {
  const f = tmp();
  saveEthBlock(f, 5000);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), '5000');
  assert.strictEqual(loadEthBlock(f), 4950);
});

test('nextWindow caps the range at 100 blocks and at the chain head', () => {
  assert.deepStrictEqual(nextWindow(0, 1000), { to_block: 100, up_to_date: false });
  assert.deepStrictEqual(nextWindow(950, 1000), { to_block: 1000, up_to_date: false });
  assert.deepStrictEqual(nextWindow(1000, 1000), { to_block: 1000, up_to_date: true });
  assert.deepStrictEqual(nextWindow(1200, 1000), { to_block: 1000, up_to_date: true });
});

test('WAX cursor: load handles missing, valid and corrupt files', () => {
  const missing = createWaxCursor(tmp());
  assert.strictEqual(missing.load(), null);

  const f = tmp();
  fs.writeFileSync(f, ' 777\n');
  assert.strictEqual(createWaxCursor(f).load(), 777);

  fs.writeFileSync(f, 'garbage');
  assert.strictEqual(createWaxCursor(f).load(), null);
});

test('WAX cursor: save writes the block and skips zero and repeated values', () => {
  const f = tmp();
  const c = createWaxCursor(f);
  c.save(0);
  assert.strictEqual(fs.existsSync(f), false);
  c.save(10);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), '10');
  fs.writeFileSync(f, 'sentinel');
  c.save(10);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), 'sentinel', 'repeat block must not rewrite');
  c.save(11);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), '11');
});

test('WAX cursor: a failed write is logged, not thrown', () => {
  const errors = [];
  const c = createWaxCursor(path.join(os.tmpdir(), 'no-such-dir-xyz', 'cursor'), (m) => errors.push(m));
  assert.doesNotThrow(() => c.save(5));
  assert.match(errors[0], /Failed to save WAX cursor 5/);
});

test('rewindWaxStart rewinds by 50 and never goes below 1', () => {
  assert.strictEqual(rewindWaxStart(1000), 950);
  assert.strictEqual(rewindWaxStart(30), 1);
  assert.strictEqual(rewindWaxStart(1), 1);
});

test('WAX cursor: an unreadable path loads as null instead of throwing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-cursor-dir-'));
  assert.strictEqual(createWaxCursor(dir).load(), null);
});
