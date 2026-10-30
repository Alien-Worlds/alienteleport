'use strict';

// Golden values were produced by the inline logic in oracle-eth.js before it was extracted.

const test = require('node:test');
const assert = require('node:assert');
const ethers = require('ethers');
const {
  claimed_topic,
  teleport_topic,
  decodeClaimedLog,
  decodeTeleportLog,
  buildClaimedAction,
  buildReceivedAction,
} = require('../lib/oracle/eth-events');

const config = {
  precision: 4,
  symbol: 'TLM',
  eos: { teleportContract: 'teleporteos', oracleAccount: 'oracle1' },
};

const CLAIMED_DATA =
  '0x000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000000000000000000000000000000000000deadbeef000000000000000000000000000000000000000000000000000000000016e360';
const TELEPORT_DATA =
  '0x0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000012d6440000000000000000000000000000000000000000000000000000000000000063000000000000000000000000000000000000000000000000000000000000000c616c696365313233343536370000000000000000000000000000000000000000';

test('topic constants are unchanged', () => {
  assert.strictEqual(claimed_topic, '0xf20fc6923b8057dd0c3b606483fcaa038229bb36ebc35a0040e3eaa39cf97b17');
  assert.strictEqual(teleport_topic, '0x622824274e0937ee319b036740cd0887131781bc2032b47eac3e88a1be17f5d5');
});

test('decodeClaimedLog matches the pre-refactor output', () => {
  assert.deepStrictEqual(decodeClaimedLog({ data: CLAIMED_DATA }, config), {
    id: 42,
    to_eth: '00000000000000000000000000000000DeaDBeef000000000000000000000000',
    quantity: '150.0000 TLM',
  });
});

test('decodeTeleportLog matches the pre-refactor output and strips the 0x prefix', () => {
  assert.deepStrictEqual(decodeTeleportLog({ data: TELEPORT_DATA, transactionHash: '0xabc123' }, config), {
    to: 'alice1234567',
    quantity: '123.4500 TLM',
    txid: 'abc123',
  });
});

test('decodeTeleportLog returns null for a zero amount', () => {
  const data = ethers.utils.defaultAbiCoder.encode(['string', 'uint', 'uint'], ['alice1234567', 0, 1]);
  assert.strictEqual(decodeTeleportLog({ data, transactionHash: '0xabc' }, config), null);
});

test('decoders honour the configured precision and symbol', () => {
  const data = ethers.utils.defaultAbiCoder.encode(['string', 'uint', 'uint'], ['bob', 12345678, 1]);
  const out = decodeTeleportLog({ data, transactionHash: '0xff' }, { ...config, precision: 8, symbol: 'ABC' });
  assert.strictEqual(out.quantity, '0.12345678 ABC');
});

test('decoders throw on malformed log data', () => {
  assert.throws(() => decodeClaimedLog({ data: '0x1234' }, config));
  assert.throws(() => decodeTeleportLog({ data: '0x', transactionHash: '0x1' }, config));
});

test('buildReceivedAction shape', () => {
  assert.deepStrictEqual(buildReceivedAction(config, { to: 'alice1234567', txid: 'abc123', quantity: '123.4500 TLM' }, 2), [
    {
      account: 'teleporteos',
      name: 'received',
      authorization: [{ actor: 'oracle1', permission: 'active' }],
      data: {
        oracle_name: 'oracle1',
        to: 'alice1234567',
        ref: 'abc123',
        quantity: '123.4500 TLM',
        chain_id: 2,
        confirmed: true,
      },
    },
  ]);
});

test('buildClaimedAction shape and custom permission', () => {
  const custom = { ...config, eos: { ...config.eos, oraclePermission: 'oracle' } };
  assert.deepStrictEqual(buildClaimedAction(custom, { id: 42, to_eth: 'aa', quantity: '150.0000 TLM' }), [
    {
      account: 'teleporteos',
      name: 'claimed',
      authorization: [{ actor: 'oracle1', permission: 'oracle' }],
      data: { oracle_name: 'oracle1', id: 42, to_eth: 'aa', quantity: '150.0000 TLM' },
    },
  ]);
});
