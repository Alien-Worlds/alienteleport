'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { findLogTeleportActs } = require('../lib/oracle/traces');

const act = (account, name, data = 'd') => ({ account, name, data });
const trx = (...actions) => ['transaction_trace_v0', { action_traces: actions }];

test('finds logteleport on the teleport contract in v0 and v1 action traces', () => {
  const a = act('teleporteos', 'logteleport', 'one');
  const b = act('teleporteos', 'logteleport', 'two');
  const found = findLogTeleportActs([trx(['action_trace_v0', { act: a }], ['action_trace_v1', { act: b }])], 'teleporteos');
  assert.deepStrictEqual(found, [a, b]);
});

test('ignores other contracts, other action names and unknown trace types', () => {
  const traces = [
    trx(
      ['action_trace_v0', { act: act('other', 'logteleport') }],
      ['action_trace_v0', { act: act('teleporteos', 'teleport') }],
      ['action_trace_v2', { act: act('teleporteos', 'logteleport') }]
    ),
    ['transaction_trace_v1', { action_traces: [['action_trace_v0', { act: act('teleporteos', 'logteleport') }]] }],
  ];
  assert.deepStrictEqual(findLogTeleportActs(traces, 'teleporteos'), []);
});

test('preserves order across several transactions', () => {
  const a = act('teleporteos', 'logteleport', 'a');
  const b = act('teleporteos', 'logteleport', 'b');
  const found = findLogTeleportActs([trx(['action_trace_v0', { act: a }]), trx(['action_trace_v0', { act: b }])], 'teleporteos');
  assert.deepStrictEqual(found.map((x) => x.data), ['a', 'b']);
});

test('empty input yields nothing', () => {
  assert.deepStrictEqual(findLogTeleportActs([], 'teleporteos'), []);
});
