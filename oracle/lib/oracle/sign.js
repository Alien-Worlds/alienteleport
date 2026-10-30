'use strict';

const ethUtil = require('ethereumjs-util');

/**
 * Sign the raw serialized `logteleport` action data with the oracle's ETH key.
 * The signed bytes come straight from the SHiP trace, so changing anything here
 * invalidates signatures against the on-chain teleport record.
 */
function signTeleport(serialized, privateKeyHex) {
  const msgHash = ethUtil.keccak(Buffer.from(serialized));
  const pk = Buffer.from(privateKeyHex, 'hex');
  const sig = ethUtil.ecsign(msgHash, pk);
  return { msgHash, signature: ethUtil.toRpcSig(sig.v, sig.r, sig.s) };
}

function buildSignAction(config, id, signature) {
  return [
    {
      account: config.eos.teleportContract,
      name: 'sign',
      authorization: [
        {
          actor: config.eos.oracleAccount,
          permission: config.eos.oraclePermission || 'active',
        },
      ],
      data: {
        oracle_name: config.eos.oracleAccount,
        id,
        signature,
      },
    },
  ];
}

module.exports = { signTeleport, buildSignAction };
