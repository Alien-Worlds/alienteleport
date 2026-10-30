'use strict';

const ethers = require('ethers');

const claimed_topic = '0xf20fc6923b8057dd0c3b606483fcaa038229bb36ebc35a0040e3eaa39cf97b17';
const teleport_topic = '0x622824274e0937ee319b036740cd0887131781bc2032b47eac3e88a1be17f5d5';

const authorization = (config) => [
  {
    actor: config.eos.oracleAccount,
    permission: config.eos.oraclePermission || 'active',
  },
];

/** Decode an EVM `Claimed` log into the fields the `claimed` action needs. */
function decodeClaimedLog(log, config) {
  const data = ethers.utils.defaultAbiCoder.decode(['uint64', 'address', 'uint'], log.data);
  const id = data[0].toNumber();
  const to_eth = data[1].replace('0x', '') + '000000000000000000000000';
  const quantity = (data[2].toNumber() / Math.pow(10, config.precision)).toFixed(config.precision) + ' ' + config.symbol;
  return { id, to_eth, quantity };
}

/** Decode an EVM `Teleport` log. Returns null when the token amount is zero or negative. */
function decodeTeleportLog(log, config) {
  const data = ethers.utils.defaultAbiCoder.decode(['string', 'uint', 'uint'], log.data);
  const tokens = data[1].toNumber();
  if (tokens <= 0) {
    return null;
  }
  const to = data[0];
  const amount = (tokens / Math.pow(10, config.precision)).toFixed(config.precision);
  const quantity = `${amount} ${config.symbol}`;
  const txid = log.transactionHash.replace(/^0x/, '');
  return { to, quantity, txid };
}

function buildClaimedAction(config, { id, to_eth, quantity }) {
  return [
    {
      account: config.eos.teleportContract,
      name: 'claimed',
      authorization: authorization(config),
      data: {
        oracle_name: config.eos.oracleAccount,
        id,
        to_eth,
        quantity,
      },
    },
  ];
}

function buildReceivedAction(config, { to, txid, quantity }, chain_id) {
  return [
    {
      account: config.eos.teleportContract,
      name: 'received',
      authorization: authorization(config),
      data: {
        oracle_name: config.eos.oracleAccount,
        to,
        ref: txid,
        quantity,
        chain_id,
        confirmed: true,
      },
    },
  ];
}

module.exports = {
  claimed_topic,
  teleport_topic,
  decodeClaimedLog,
  decodeTeleportLog,
  buildClaimedAction,
  buildReceivedAction,
};
