'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { FIXTURE_CONFIG } = require('./helpers');

process.env.CONFIG = FIXTURE_CONFIG;
const { live } = require('../lib/monitor/context');
const { deriveStatus, toPublicStatus } = require('../lib/monitor/status');

const HIST = 1000;
const RECENT_AGE = 10;
const OLD_AGE = 5000;

const tele = (id, extra = {}) => ({ id, chain_id: 2, account: 'alice', quantity: '1.0000 TLM', age_sec: RECENT_AGE, ...extra });
const receipt = (id, extra = {}) => ({ id, chain_id: 1, to: '0xabc', ref: 'r', quantity: '1.0000 TLM', age_sec: RECENT_AGE, ...extra });

function report(over = {}) {
  return {
    thresholds: { historical_age_sec: HIST },
    missing_for_this_oracle: { count: 0, wax_to_evm: [], evm_to_wax: [] },
    system_incomplete: { count: 0, wax_to_evm: [], evm_to_wax: [] },
    awaiting_user_claim: { count: 0, sample: [] },
    ...over,
  };
}

const reset = () => {
  live.last_error = null;
  live.report = null;
  live.last_exit_hint = null;
  live.scan_count = 0;
};

test.beforeEach(reset);
test.after(reset);

test('scan error outranks everything, even with no report', () => {
  live.last_error = 'boom';
  const s = deriveStatus(report());
  assert.strictEqual(s.status, 'scan_error');
  assert.strictEqual(s.severity, 'critical');
  assert.match(s.status_detail, /boom/);
});

test('no report yet means starting, severity info', () => {
  const s = deriveStatus(null);
  assert.strictEqual(s.status, 'starting');
  assert.strictEqual(s.severity, 'info');
});

test('empty report is ok', () => {
  const s = deriveStatus(report());
  assert.strictEqual(s.status, 'ok');
  assert.strictEqual(s.severity, 'ok');
  assert.deepStrictEqual(s.reasons, []);
});

test('recent missing signatures is critical and points at the SHiP reader', () => {
  const s = deriveStatus(report({ missing_for_this_oracle: { count: 1, wax_to_evm: [tele(1)], evm_to_wax: [] } }));
  assert.strictEqual(s.status, 'oracle_missing_signatures');
  assert.strictEqual(s.severity, 'critical');
  assert.strictEqual(s.reasons[0].code, 'oracle_missing_signatures');
  assert.strictEqual(s.actions[0].target, 'wax_reader');
});

test('recent missing approvals is critical and points at the EVM reader', () => {
  const s = deriveStatus(report({ missing_for_this_oracle: { count: 1, wax_to_evm: [], evm_to_wax: [receipt(1)] } }));
  assert.strictEqual(s.status, 'oracle_missing_approvals');
  assert.strictEqual(s.actions[0].target, 'evm_reader');
});

test('missing both directions is oracle_action_needed', () => {
  const s = deriveStatus(report({ missing_for_this_oracle: { count: 2, wax_to_evm: [tele(1)], evm_to_wax: [receipt(2)] } }));
  assert.strictEqual(s.status, 'oracle_action_needed');
});

test('missing plus stuck is oracle_action_and_stuck', () => {
  const s = deriveStatus(
    report({
      missing_for_this_oracle: { count: 1, wax_to_evm: [tele(1)], evm_to_wax: [] },
      system_incomplete: { count: 1, wax_to_evm: [tele(2, { this_oracle_signed: true })], evm_to_wax: [] },
    })
  );
  assert.strictEqual(s.status, 'oracle_action_and_stuck');
  assert.ok(s.reasons.some((r) => r.code === 'stuck_teleports'));
});

test('stuck only counts items this oracle already signed or approved', () => {
  const notMine = deriveStatus(report({ system_incomplete: { count: 1, wax_to_evm: [tele(1)], evm_to_wax: [] } }));
  assert.strictEqual(notMine.status, 'ok');

  const signed = deriveStatus(
    report({ system_incomplete: { count: 1, wax_to_evm: [tele(1, { this_oracle_signed: true })], evm_to_wax: [] } })
  );
  assert.strictEqual(signed.status, 'stuck_bridge_items');
  assert.strictEqual(signed.severity, 'warning');

  const approved = deriveStatus(
    report({ system_incomplete: { count: 1, wax_to_evm: [], evm_to_wax: [receipt(1, { this_oracle_approved: true })] } })
  );
  assert.ok(approved.reasons.some((r) => r.code === 'stuck_receipts'));
});

test('historical items never raise an alarm', () => {
  const s = deriveStatus(
    report({
      missing_for_this_oracle: { count: 1, wax_to_evm: [tele(1, { age_sec: OLD_AGE })], evm_to_wax: [] },
      system_incomplete: { count: 1, wax_to_evm: [tele(2, { age_sec: OLD_AGE, this_oracle_signed: true })], evm_to_wax: [] },
    })
  );
  assert.strictEqual(s.status, 'ok_with_historical');
  assert.strictEqual(s.severity, 'ok');
  assert.strictEqual(s.reasons[0].code, 'historical_incomplete');
  assert.strictEqual(s.reasons[0].count, 2);
});

test('an item exactly at the historical age counts as historical', () => {
  const s = deriveStatus(report({ missing_for_this_oracle: { count: 1, wax_to_evm: [tele(1, { age_sec: HIST })], evm_to_wax: [] } }));
  assert.strictEqual(s.status, 'ok_with_historical');
});

test('lagging and offline readers give readers_behind with a start action', () => {
  const s = deriveStatus(
    report({
      chain_readers: {
        summary: { lagging: 1, offline: 1 },
        readers: [
          { name: 'AW-ETH-ORACLE', health: 'lagging', lag_blocks: 5000, cursor_block: 1, chain_head: 5001 },
          { name: 'AW-BSC-ORACLE', health: 'stopped' },
          { name: 'AW-WAX-ORACLE', health: 'not_found' },
          { name: 'AW-OK', health: 'ok' },
        ],
      },
    })
  );
  assert.strictEqual(s.status, 'readers_behind');
  assert.strictEqual(s.severity, 'warning');
  assert.deepStrictEqual(
    s.reasons.map((r) => r.code),
    ['reader_lagging', 'reader_offline', 'reader_offline']
  );
  assert.match(s.reasons[2].message, /not found/);
  assert.deepStrictEqual(
    s.actions.map((a) => a.title),
    ['Start AW-BSC-ORACLE', 'Start AW-WAX-ORACLE']
  );
});

test('reader trouble does not mask a missing signature', () => {
  const s = deriveStatus(
    report({
      missing_for_this_oracle: { count: 1, wax_to_evm: [tele(1)], evm_to_wax: [] },
      chain_readers: { summary: { lagging: 1, offline: 0 }, readers: [{ name: 'r', health: 'lagging', lag_blocks: 1 }] },
    })
  );
  assert.strictEqual(s.status, 'oracle_missing_signatures');
});

test('legacy antelope_* list keys are still read', () => {
  const s = deriveStatus(
    report({ missing_for_this_oracle: { count: 1, antelope_to_evm: [tele(1)], evm_to_antelope: [receipt(2)] } })
  );
  assert.strictEqual(s.status, 'oracle_action_needed');
});

test('the antelope chain name from the report appears in messages', () => {
  const s = deriveStatus(
    report({ antelope_chain: 'TESTNET', missing_for_this_oracle: { count: 1, wax_to_evm: [tele(1)], evm_to_wax: [] } })
  );
  assert.match(s.status_detail, /TESTNET→EVM/);
});

test('toPublicStatus without a report returns only the base fields', () => {
  live.started_at = new Date(Date.now() - 5000).toISOString();
  live.scan_count = 0;
  const p = toPublicStatus();
  assert.strictEqual(p.service, 'alienteleport-oracle-monitor');
  assert.strictEqual(p.status, 'starting');
  assert.strictEqual(p.healthy, false);
  assert.strictEqual(p.oracle_account, undefined);
  assert.strictEqual(p.network, null);
  assert.strictEqual(p.teleport_contract, undefined);
  assert.strictEqual(p.node, process.version);
  assert.ok(p.uptime_sec >= 4);
  assert.strictEqual(p.summary, undefined);
});

test('toPublicStatus summarises, enriches and strips unknown fields', () => {
  live.report = report({
    antelope_chain: 'WAX',
    chain_id_filter: null,
    scanned: { teleports: 3 },
    missing_for_this_oracle: {
      count: 2,
      wax_to_evm: [tele(1, { secret: 'leak', signatures: 1, threshold: 3 }), tele(2, { age_sec: OLD_AGE })],
      evm_to_wax: [],
    },
    system_incomplete: { count: 0, wax_to_evm: [], evm_to_wax: [] },
    awaiting_user_claim: { count: 4, sample: [{ id: 9, chain_id: 1, account: 'bob', quantity: '2.0000 TLM', signatures: 3, secret: 'x' }] },
  });
  const p = toPublicStatus();
  assert.strictEqual(p.healthy, false);
  assert.strictEqual(p.status, 'oracle_missing_signatures');
  assert.strictEqual(p.summary.missing_mine, 1);
  assert.strictEqual(p.summary.missing_signatures, 1);
  assert.strictEqual(p.summary.historical_missing_mine, 1);
  assert.strictEqual(p.summary.awaiting_user_claim, 4);
  assert.strictEqual(p.summary.missing_mine_total, 2);

  const lists = p.missing_for_this_oracle.wax_to_evm;
  assert.strictEqual(lists.recent_count, 1);
  assert.strictEqual(lists.historical_count, 1);
  assert.strictEqual(lists.recent[0].chain_name, 'BSC (2)');
  assert.strictEqual(lists.recent[0].age, '10s');
  assert.strictEqual(lists.recent[0].historical, false);
  assert.strictEqual('secret' in lists.recent[0], false);
  assert.strictEqual(lists.historical[0].historical, true);
  assert.deepStrictEqual(lists.all.map((x) => x.id), [1, 2], 'recent first, then historical');
  assert.strictEqual(p.missing_for_this_oracle.antelope_to_evm, lists, 'legacy alias points at the same data');

  assert.deepStrictEqual(p.awaiting_user_claim.sample, [
    { id: 9, chain_id: 1, chain_name: 'Ethereum (1)', account: 'bob', quantity: '2.0000 TLM', signatures: 3 },
  ]);
});

test('a clean report is healthy', () => {
  live.report = report();
  const p = toPublicStatus();
  assert.strictEqual(p.healthy, true);
  assert.strictEqual(p.status, 'ok');
});

test('lists are capped at 50 entries but report the full count', () => {
  const many = Array.from({ length: 60 }, (_, i) => tele(i + 1));
  live.report = report({ missing_for_this_oracle: { count: 60, wax_to_evm: many, evm_to_wax: [] } });
  const lists = toPublicStatus().missing_for_this_oracle.wax_to_evm;
  assert.strictEqual(lists.recent.length, 50);
  assert.strictEqual(lists.recent_count, 60);
  assert.strictEqual(lists.all.length, 50);
});

test('receipts are enriched with chain name and age and stripped of unknown fields', () => {
  live.report = report({
    missing_for_this_oracle: {
      count: 2,
      wax_to_evm: [],
      evm_to_wax: [
        receipt(1, { confirmations: 2, threshold: 5, approvers: ['o1'], this_oracle_approved: false, secret: 'leak' }),
        receipt(2, { age_sec: OLD_AGE }),
      ],
    },
  });
  const lists = toPublicStatus().missing_for_this_oracle.evm_to_wax;
  assert.deepStrictEqual(lists.recent[0], {
    id: 1,
    chain_id: 1,
    to: '0xabc',
    ref: 'r',
    quantity: '1.0000 TLM',
    confirmations: 2,
    threshold: 5,
    approvers: ['o1'],
    age_sec: RECENT_AGE,
    this_oracle_approved: false,
    chain_name: 'Ethereum (1)',
    age: '10s',
    historical: false,
  });
  assert.strictEqual(lists.historical[0].historical, true);
});
