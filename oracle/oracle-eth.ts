#!/usr/bin/env node

/*
This oracle listens to the ethereum blockchain for `Teleport` events.

When an event is received, it will call the `received` action on the EOS chain
 */

process.title = `oracle-eth ${process.env['CONFIG']}`;

import fs from 'fs';
import { ethers } from 'ethers';
import { SingleRun, Sleep } from 'eosio-helpers';
import yargs from 'yargs';
import { ConfigType } from './CommonTypes';

const config: ConfigType = require(process.env['CONFIG'] || './config');

const provider = new ethers.providers.StaticJsonRpcProvider(
  config.eth.endpoint
);

const network = config.network;
const blocks_file_name = `.oracle_${network}_block-${config.eth.oracleAccount}`;
const DEFAULT_BLOCKS_TO_WAIT = 5;
const claimed_topic =
  '0xf20fc6923b8057dd0c3b606483fcaa038229bb36ebc35a0040e3eaa39cf97b17';
const teleport_topic =
  '0x622824274e0937ee319b036740cd0887131781bc2032b47eac3e88a1be17f5d5';
const precision = 4;

const await_confirmation = async (txid: string) => {
  return new Promise(async (resolve) => {
    let resolved = false;
    while (!resolved) {
      provider.getTransactionReceipt(txid).then((receipt) => {
        if (receipt && receipt.confirmations > DEFAULT_BLOCKS_TO_WAIT) {
          console.log(`TX ${txid} has ${receipt.confirmations} confirmations`);
          resolve(receipt);
          resolved = true;
        }
      });
      await Sleep(10000);
    }
  });
};

/**
 * Loads a block number from a saved file if one exists or throws an error.
 * @returns a saved block number from a file
 */
const load_block_number_from_file = async (
  blocks_file: string = blocks_file_name
) => {
  //   let block_number: string | number = 'latest';
  if (!fs.existsSync(blocks_file))
    throw new Error('block file does not exist.');

  const file_contents = fs.readFileSync(blocks_file).toString();
  if (!file_contents) throw new Error('No blocks file');

  const block_number = parseInt(file_contents);
  if (isNaN(block_number)) throw new Error('No block number in file.');

  return block_number;
};

const save_block_to_file = async (
  block_num: number,
  blocks_file: string = blocks_file_name
) => {
  fs.writeFileSync(blocks_file, block_num.toString());
};

type eosio_claim_data = {
  oracle_name: string;
  id: string;
  to_eth: string;
  quantity: string;
};

type eosio_teleport_data = {
  oracle_name: string;
  to: string;
  ref: string;
  quantity: string;
  chain_id: string;
  confirmed: boolean;
};

export const extractEthClaimedData = (
  data: ethers.utils.Result
): eosio_claim_data => {
  const id = data[0].toNumber();
  const to_eth = data[1].replace('0x', '') + '000000000000000000000000';
  const quantity =
    (data[2].toNumber() / Math.pow(10, precision)).toFixed(precision) +
    ' ' +
    config.symbol;
  return {
    oracle_name: config.eos.oracleAccount,
    id,
    to_eth,
    quantity,
  };
};

export const extractEthTeleportData = (
  data: ethers.utils.Result,
  transactionHash: string
): eosio_teleport_data => {
  const tokens = data[1].toNumber();
  if (tokens <= 0) {
    throw new Error('Tokens are less than or equal to 0');
  }
  const to = data[0];
  const chain_id = data[2].toNumber();
  const amount = (tokens / Math.pow(10, config.precision)).toFixed(
    config.precision
  );
  const quantity = `${amount} ${config.symbol}`;
  const txid = transactionHash.replace(/^0x/, '');

  return {
    chain_id,
    confirmed: true,
    quantity,
    to,
    oracle_name: config.eos.oracleAccount,
    ref: txid,
  };
};

const process_claimed = async (
  from_block: number,
  to_block: number,
  submit_to_blockchain: boolean
) => {
  const query = {
    fromBlock: from_block,
    toBlock: to_block,
    address: config.eth.teleportContract,
    topics: [claimed_topic],
  };
  const res = await provider.getLogs(query);

  //   console.log(res);

  for await (const { transactionHash, data } of res) {
    const decodedData = ethers.utils.defaultAbiCoder.decode(
      ['uint64', 'address', 'uint'],
      data
    );

    const eosioData = extractEthClaimedData(decodedData);

    // wait for confirmation of each transaction before continuing
    await await_confirmation(transactionHash);
    const actions = [
      {
        account: config.eos.teleportContract,
        name: 'claimed',
        authorization: [
          {
            actor: config.eos.oracleAccount,
            permission: config.eos.oraclePermission || 'active',
          },
        ],
        data: eosioData,
      },
    ];

    try {
      const eos_res = await SingleRun({
        actions,
        eos_endpoint: config.eos.endpoint,
        submit_to_blockchain,
        private_keys: [{ pk: config.eos.privateKey }],
      });
      console.log(
        `Sent notification of claim with txid ${
          eos_res.transaction_id
        }, for ID ${eosioData.id}, account 0x${eosioData.to_eth.substring(
          0,
          40
        )}, quantity ${eosioData.quantity}`
      );
    } catch (e: any) {
      if (e.message.indexOf('Already marked as claimed') > -1) {
        console.log(
          `ID ${
            eosioData.id
          } is already claimed, account 0x${eosioData.to_eth.substring(
            0,
            40
          )}, quantity ${eosioData.quantity}`
        );
      } else {
        console.error(`Error sending confirm ${e.message}`);
      }
    }
  }
};

const process_teleported = async (
  from_block: number,
  to_block: number,
  submit_to_blockchain: boolean
) => {
  const query = {
    fromBlock: from_block,
    toBlock: to_block,
    address: config.eth.teleportContract,
    topics: [teleport_topic],
  };

  const res = await provider.getLogs(query);

  for await (const { transactionHash, data } of res) {
    const decodedData = ethers.utils.defaultAbiCoder.decode(
      ['string', 'uint', 'uint'],
      data
    );

    const eosioData = extractEthTeleportData(decodedData, transactionHash);

    await await_confirmation(transactionHash);
    const actions = [
      {
        account: config.eos.teleportContract,
        name: 'received',
        authorization: [
          {
            actor: config.eos.oracleAccount,
            permission: config.eos.oraclePermission || 'active',
          },
        ],
        data: eosioData,
      },
    ];

    try {
      const eos_res = await SingleRun({
        actions,
        eos_endpoint: config.eos.endpoint,
        submit_to_blockchain,
        private_keys: [{ pk: config.eos.privateKey }],
      });

      console.log(
        `Sent notification of teleport with txid ${eos_res.transaction_id}`
      );
    } catch (e: any) {
      if (e.message.indexOf('Oracle has already approved') > -1) {
        console.log('Oracle has already approved');
      } else {
        console.error(`Error sending teleport ${e.message}`);
      }
    }
    {
      //if (res.length) {
      // for (let r = 0; r < res.length; r++) {
      //   const data = ethers.utils.defaultAbiCoder.decode(
      //     ['string', 'uint', 'uint'],
      //     res[r].data
      //   );
      // console.log(res[r], data, data[1].toString())
      //   const tokens = data[1].toNumber();
      //   if (tokens <= 0) {
      //     // console.error(data);
      //     console.error('Tokens are less than or equal to 0');
      //     continue;
      //   }
      //   const to = data[0];
      //   const chain_id = data[2].toNumber();
      //   const amount = (tokens / Math.pow(10, config.precision)).toFixed(
      //     config.precision
      //   );
      //   const quantity = `${amount} ${config.symbol}`;
      //   const txid = res[r].transactionHash.replace(/^0x/, '');
      //   const actions: EosioAction[] = [];
      //   actions.push({
      //     account: config.eos.teleportContract,
      //     name: 'received',
      //     authorization: [
      //       {
      //         actor: config.eos.oracleAccount,
      //         permission: config.eos.oraclePermission || 'active',
      //       },
      //     ],
      //     data: {
      //       oracle_name: config.eos.oracleAccount,
      //       to,
      //       ref: txid,
      //       quantity,
      //       chain_id,
      //       confirmed: true,
      //     },
      //   });
      //   // console.log(actions);
      //   await_confirmation(res[r].transactionHash).then(async () => {
      //     try {
      //       const eos_res = await eos_api.transact(
      //         { actions },
      //         {
      //           blocksBehind: 3,
      //           expireSeconds: 180,
      //         }
      //       );
      //       console.log(
      //         `Sent notification of teleport with txid ${eos_res.transaction_id}`
      //       );
      //       // resolve();
      //     } catch (e) {
      //       if (e.message.indexOf('Oracle has already approved') > -1) {
      //         console.log('Oracle has already approved');
      //       } else {
      //         console.error(`Error sending teleport ${e.message}`);
      //         // reject(e);
      //       }
      //     }
      //   });
    }

    await Sleep(500);
  }
};

const run = async (
  start_ref: 'latest' | number,
  submit_to_blockchain: boolean
) => {
  let from_block: number | undefined;
  while (true) {
    try {
      const block = await provider.getBlock('latest');
      const latest_block = block.number;

      if (!from_block) {
        if (start_ref === 'latest') {
          try {
            from_block = await load_block_number_from_file();

            //   for fresh start go back 50 blocks
            from_block -= 50;
            console.log(
              `Starting from saved block with additional previous 50 blocks for safety: ${from_block}. `
            );
          } catch (err) {
            console.log(err);
            // could not get block from file and it wasn't specified (go back 100 blocks from latest)
            from_block = latest_block - 100;
          }
        } else if (typeof start_ref === 'number') {
          from_block = start_ref;
        } else {
          from_block = config.eth.genesisBlock;
        }
      }
      let to_block = Math.min(from_block + 100, latest_block);

      if (start_ref >= latest_block) {
        console.log(`Up to date at block ${to_block}`);
        await Sleep(10000);
      }
      console.log(`Getting events from block ${from_block} to ${to_block}`);

      await process_claimed(from_block, to_block, submit_to_blockchain);
      await process_teleported(from_block, to_block, submit_to_blockchain);

      from_block = to_block;

      // save last block received
      await save_block_to_file(to_block);

      if (latest_block - from_block <= 1000) {
        console.log('Waiting...');
        await Sleep(30000);
      } else {
        console.log(`Not waiting... ${latest_block} - ${from_block}`);
      }
    } catch (e: any) {
      console.error(e.message);
    }
  }
};

(async () => {
  let startRef: 'latest' | number = 'latest';

  let { start_block, submit_to_blockchain } = await yargs(process.argv)
    .option('start_block', {
      alias: 's',
      desc: 'start block to start scanning from',
      number: true,
      demandOption: false,
    })
    .option('submit_to_blockchain', {
      alias: 'b',
      boolean: true,
      description:
        'boolean to determine if it should submit actions to Wax blockchain',
      default: false,
      demandOption: false,
    }).argv;

  if (start_block) {
    startRef = start_block;
  } else if (process.env['START_BLOCK']) {
    const start_block_env = parseInt(process.env['START_BLOCK']);
    if (isNaN(start_block_env)) {
      console.error(`You must supply start block as an integer in env`);
      process.exit(1);
    }
    startRef = start_block_env;
  }

  run(startRef, submit_to_blockchain);
})().catch((e) => {
  console.error('error: ', e);
});
