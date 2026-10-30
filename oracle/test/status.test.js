'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { FIXTURE_CONFIG } = require('./helpers');

// context.js loads the config at require time; point it at the fixture before importing status.
process.env.CONFIG = FIXTURE_CONFIG;
const { chainLabel, formatAge, isHistorical, splitAge, historicalAgeSec } = require('../lib/monitor/status');

const YEAR = 365 * 24 * 3600;

test('chainLabel names known chains and falls back for unknown ones', () => {
  assert.strictEqual(chainLabel(1), 'Ethereum (1)');
  assert.strictEqual(chainLabel('2'), 'BSC (2)');
  assert.strictEqual(chainLabel(0), 'legacy/unknown (0)');
  assert.strictEqual(chainLabel(99), 'chain 99');
});

test('formatAge picks the right unit at each boundary', () => {
  assert.strictEqual(formatAge(0), '0s');
  assert.strictEqual(formatAge(119), '119s');
  assert.strictEqual(formatAge(120), '2m');
  assert.strictEqual(formatAge(3599), '59m');
  assert.strictEqual(formatAge(3600), '1h');
  assert.strictEqual(formatAge(86399), '23h');
  assert.strictEqual(formatAge(86400), '1d');
  assert.strictEqual(formatAge(59 * 86400), '59d');
  assert.strictEqual(formatAge(60 * 86400), '2mo');
  assert.strictEqual(formatAge(YEAR), '1.0y');
  assert.strictEqual(formatAge(2 * YEAR), '2.0y');
});

test('formatAge handles missing and invalid input', () => {
  assert.strictEqual(formatAge(null), '—');
  assert.strictEqual(formatAge(undefined), '—');
  assert.strictEqual(formatAge(''), '—');
  assert.strictEqual(formatAge(-5), '-5');
  assert.strictEqual(formatAge('abc'), 'abc');
});

test('isHistorical is true at and beyond the cutoff only', () => {
  assert.strictEqual(isHistorical({ age_sec: 99 }, 100), false);
  assert.strictEqual(isHistorical({ age_sec: 100 }, 100), true);
  assert.strictEqual(isHistorical({ age_sec: '500' }, 100), true);
  assert.strictEqual(isHistorical({}, 100), false);
  assert.strictEqual(isHistorical({ age_sec: null }, 100), false);
  assert.strictEqual(isHistorical({ age_sec: 'x' }, 100), false);
  assert.strictEqual(isHistorical(null, 100), false);
});

test('splitAge partitions items and tolerates missing lists', () => {
  const items = [{ id: 1, age_sec: 10 }, { id: 2, age_sec: 1000 }, { id: 3 }, { id: 4, age_sec: 100 }];
  const { recent, historical } = splitAge(items, 100);
  assert.deepStrictEqual(recent.map((x) => x.id), [1, 3]);
  assert.deepStrictEqual(historical.map((x) => x.id), [2, 4]);
  assert.deepStrictEqual(splitAge(undefined, 100), { recent: [], historical: [] });
});

test('historicalAgeSec uses the report threshold, else one year', () => {
  assert.strictEqual(historicalAgeSec({ thresholds: { historical_age_sec: 7200 } }), 7200);
  assert.strictEqual(historicalAgeSec({ thresholds: {} }), YEAR);
  assert.strictEqual(historicalAgeSec({}), YEAR);
  assert.strictEqual(historicalAgeSec(null), YEAR);
});
