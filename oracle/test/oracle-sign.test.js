'use strict';

// Golden values were produced by the inline logic in oracle-eos.js before it was extracted.
// If these change, every stored oracle signature stops matching: treat a failure as a break.

const test = require('node:test');
const assert = require('node:assert');
const ethUtil = require('ethereumjs-util');
const { signTeleport, buildSignAction } = require('../lib/oracle/sign');

const KEY = '11'.repeat(32);

test('signTeleport reproduces the pre-refactor signature for Uint8Array data', () => {
  const { msgHash, signature } = signTeleport(Uint8Array.from([1, 2, 3, 4, 5, 250, 251, 252]), KEY);
  assert.strictEqual(msgHash.toString('hex'), '9184158e2f3be249a208e65123ef2c31e938112dce376aa01090ef98b753a91a');
  assert.strictEqual(
    signature,
    '0x8dc6f2874d8c6c37fb38b1ab9cbf5031712e96730b5fb0939207b076b4daeb3a648d38b09e405742f640d75fa869d524755a91745730c8e9628788985075d9411c'
  );
});

test('signTeleport reproduces the pre-refactor signature for Buffer data', () => {
  const { msgHash, signature } = signTeleport(Buffer.from('logteleport-bytes'), KEY);
  assert.strictEqual(msgHash.toString('hex'), '26396ffadf9951679a030ea99ecb3b17ac7d089ff423c0adb674b770b98e99c7');
  assert.strictEqual(
    signature,
    '0xaeebce788c49a3adb7eeaf0e6d3d8fa1865c1fdeee5681cd080462a8fd95baaf56f0b3378b283fe03a8df5dcb3ba1242be873a8811e4a2c70ba28143308ea3ad1b'
  );
});

test('signature recovers to the oracle ETH address', () => {
  const data = Uint8Array.from([9, 8, 7]);
  const { msgHash, signature } = signTeleport(data, KEY);
  const { v, r, s } = ethUtil.fromRpcSig(signature);
  const recovered = ethUtil.pubToAddress(ethUtil.ecrecover(msgHash, v, r, s));
  assert.strictEqual(recovered.toString('hex'), ethUtil.privateToAddress(Buffer.from(KEY, 'hex')).toString('hex'));
});

test('signing is deterministic and sensitive to every byte', () => {
  const a = signTeleport(Uint8Array.from([1, 2, 3]), KEY).signature;
  assert.strictEqual(signTeleport(Uint8Array.from([1, 2, 3]), KEY).signature, a);
  assert.notStrictEqual(signTeleport(Uint8Array.from([1, 2, 4]), KEY).signature, a);
});

test('buildSignAction shape, with the default and a custom permission', () => {
  const config = { eos: { teleportContract: 'teleporteos', oracleAccount: 'oracle1' } };
  assert.deepStrictEqual(buildSignAction(config, 7, '0xsig'), [
    {
      account: 'teleporteos',
      name: 'sign',
      authorization: [{ actor: 'oracle1', permission: 'active' }],
      data: { oracle_name: 'oracle1', id: 7, signature: '0xsig' },
    },
  ]);
  const custom = { eos: { ...config.eos, oraclePermission: 'oracle' } };
  assert.strictEqual(buildSignAction(custom, 7, 's')[0].authorization[0].permission, 'oracle');
});
