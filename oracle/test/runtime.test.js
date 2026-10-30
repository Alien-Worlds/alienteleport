'use strict';

// Behaviour checks for the oracle's runtime dependencies on the Node version running the suite.
// All network traffic stays on 127.0.0.1.

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const zlib = require('node:zlib');

const KECCAK_EMPTY = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';

test('every runtime dependency loads', () => {
  for (const dep of [
    '@eosdacio/eosio-statereceiver',
    'abi-decoder',
    'eosjs',
    'eosio-helpers',
    'ethereumjs-util',
    'ethers',
    'node-fetch',
    'text-encoding',
    'web3',
  ]) {
    assert.doesNotThrow(() => require(dep), `require('${dep}') failed`);
  }
});

test('keccak256 matches the known vector and agrees across ethers, web3 and ethereumjs-util', () => {
  const { ethers } = require('ethers');
  const Web3 = require('web3');
  const { keccak256 } = require('ethereumjs-util');
  assert.strictEqual(ethers.utils.keccak256('0x'), KECCAK_EMPTY);
  assert.strictEqual('0x' + keccak256(Buffer.alloc(0)).toString('hex'), KECCAK_EMPTY);
  // web3 returns null for empty input by design, so cross-check on real data instead.
  const expected = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('teleport'));
  assert.strictEqual(new Web3().utils.sha3('teleport'), expected);
  assert.strictEqual('0x' + keccak256(Buffer.from('teleport')).toString('hex'), expected);
});

test('oracle signing: ecsign then ecrecover returns the signer address', () => {
  const { ecsign, ecrecover, keccak256, privateToAddress, pubToAddress } = require('ethereumjs-util');
  const priv = Buffer.alloc(32, 7);
  const digest = keccak256(Buffer.from('teleport payload'));
  const { r, s, v } = ecsign(digest, priv);
  const recovered = pubToAddress(ecrecover(digest, v, r, s));
  assert.strictEqual(recovered.toString('hex'), privateToAddress(priv).toString('hex'));
});

test('ethers signMessage and verifyMessage round-trip', async () => {
  const { ethers } = require('ethers');
  const wallet = new ethers.Wallet('0x' + '07'.repeat(32));
  const sig = await wallet.signMessage('teleport');
  assert.strictEqual(ethers.utils.verifyMessage('teleport', sig), wallet.address);
});

test('eosjs serializes and deserializes a name and an asset', () => {
  const { Serialize } = require('eosjs');
  const { TextEncoder, TextDecoder } = require('node:util');
  const buf = new Serialize.SerialBuffer({ textEncoder: new TextEncoder(), textDecoder: new TextDecoder() });
  buf.pushName('teleporteos');
  buf.pushAsset('100.0000 TLM');
  const out = new Serialize.SerialBuffer({
    textEncoder: new TextEncoder(),
    textDecoder: new TextDecoder(),
    array: buf.asUint8Array(),
  });
  assert.strictEqual(out.getName(), 'teleporteos');
  assert.strictEqual(out.getAsset(), '100.0000 TLM');
});

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('node-fetch decodes a Brotli-compressed response (CVE-2026-111497 code path)', async () => {
  const fetch = require('node-fetch');
  const payload = JSON.stringify({ ok: true, rows: Array.from({ length: 200 }, (_, i) => i) });
  const server = await listen((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'br' });
    res.end(zlib.brotliCompressSync(Buffer.from(payload)));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.deepStrictEqual(await res.json(), JSON.parse(payload));
  } finally {
    server.close();
  }
});

test('node-fetch surfaces a corrupt Brotli body as an error instead of crashing', async () => {
  const fetch = require('node-fetch');
  const server = await listen((req, res) => {
    res.writeHead(200, { 'content-encoding': 'br' });
    res.end(Buffer.from('this is not brotli data'));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
    await assert.rejects(() => res.text());
  } finally {
    server.close();
  }
});

test('eosjs JsonRpc reads chain info through node-fetch', async () => {
  const { JsonRpc } = require('eosjs');
  const fetch = require('node-fetch');
  const info = { chain_id: 'a'.repeat(64), head_block_num: 123, server_version_string: 'v-test' };
  const server = await listen((req, res) => {
    assert.strictEqual(req.url, '/v1/chain/get_info');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(info));
  });
  try {
    const rpc = new JsonRpc(`http://127.0.0.1:${server.address().port}`, { fetch });
    const got = await rpc.get_info();
    assert.strictEqual(got.head_block_num, 123);
    assert.strictEqual(got.chain_id, info.chain_id);
  } finally {
    server.close();
  }
});
