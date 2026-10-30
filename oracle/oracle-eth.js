#!/usr/bin/env node

/*
This oracle listens to the ethereum blockchain for `Teleport` events.

When an event is received, it will call the `received` action on the EOS chain
 */

process.title = `oracle-eth ${process.env['CONFIG']}`;

const { Api, JsonRpc } = require('eosjs');
const { TextDecoder, TextEncoder } = require('text-encoding');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');
const fetch = require('node-fetch');
const fs = require('fs');
const ethers = require('ethers');
const {
    claimed_topic,
    teleport_topic,
    decodeClaimedLog,
    decodeTeleportLog,
    buildClaimedAction,
    buildReceivedAction,
} = require('./lib/oracle/eth-events');
const { loadEthBlock, saveEthBlock, nextWindow } = require('./lib/oracle/cursor');

const config = require(process.env['CONFIG'] || './config');

const provider = new ethers.providers.StaticJsonRpcProvider(config.eth.endpoint);

const signatureProvider = new JsSignatureProvider([config.eos.privateKey]);
const rpc = new JsonRpc(config.eos.endpoint, { fetch });
const eos_api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });

const network = config.network || 'ETH'
const blocks_file = `.oracle_${config.network}_block-${config.eth.oracleAccount}`;
const chain_id = Number.parseInt(config.eth.chainId);
const DEFAULT_BLOCKS_TO_WAIT = 5;

const sleep = async (ms) => {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    })
}

const await_confirmation = async (txid) => {
    return new Promise(async resolve => {
        let resolved = false;
        while (!resolved) {
            provider.getTransactionReceipt(txid).then(receipt => {
                if (receipt && receipt.confirmations > DEFAULT_BLOCKS_TO_WAIT) {
                    console.log(`TX ${txid} has ${receipt.confirmations} confirmations`);
                    resolve(receipt);
                    resolved = true;
                }
            });
            await sleep(10000);
        }
    });
}

const load_block = async () => loadEthBlock(blocks_file);
const save_block = async (block_num) => saveEthBlock(blocks_file, block_num);

const process_claimed = async (from_block, to_block) => {
    return new Promise(async (resolve, reject) => {
        try {
            const query = {
                fromBlock: from_block,
                toBlock: to_block,
                address: config.eth.teleportContract,
                topics: [claimed_topic]
            };
            // console.log(query);
            const res = await provider.getLogs(query);
            // console.log(res);
            if (res.length) {
                for (let r = 0; r < res.length; r++) {
                    const claimed = decodeClaimedLog(res[r], config);
                    const { id, to_eth, quantity } = claimed;
                    const actions = buildClaimedAction(config, claimed);
                    // console.log(actions, res[r].transactionHash);

                    await_confirmation(res[r].transactionHash).then(async () => {
                        try {
                            const eos_res = await eos_api.transact({ actions }, {
                                blocksBehind: 3,
                                expireSeconds: 180,
                            });
                            console.log(`Sent notification of claim with txid ${eos_res.transaction_id}, for ID ${id}, account 0x${to_eth.substr(0, 40)}, quantity ${quantity}`);
                            // resolve();
                        }
                        catch (e) {
                            if (e.message.indexOf('Already marked as claimed') > -1) {
                                console.log(`ID ${id} is already claimed, account 0x${to_eth.substr(0, 40)}, quantity ${quantity}`);
                            }
                            else {
                                console.error(`Error sending confirm ${e.message}`);
                                // reject(e);
                            }
                        }
                    });

                    await sleep(500);
                }
            }

            resolve();
        }
        catch (e) {
            reject(e);
        }
    });
}

const process_teleported = async (from_block, to_block) => {
    return new Promise(async (resolve, reject) => {
        try {
            const query = {
                fromBlock: from_block,
                toBlock: to_block,
                address: config.eth.teleportContract,
                topics: [teleport_topic]
            };
            // console.log(query);
            const res = await provider.getLogs(query);
            // console.log(res);
            if (res.length) {
                for (let r = 0; r < res.length; r++) {
                    const teleport = decodeTeleportLog(res[r], config);
                    if (teleport === null) {
                        console.error('Tokens are less than or equal to 0');
                        continue;
                    }
                    const actions = buildReceivedAction(config, teleport, chain_id);
                    // console.log(actions);

                    await_confirmation(res[r].transactionHash).then(async () => {
                        try {
                            const eos_res = await eos_api.transact({ actions }, {
                                blocksBehind: 3,
                                expireSeconds: 180,
                            });
                            console.log(`Sent notification of teleport with txid ${eos_res.transaction_id}`);
                            // resolve();
                        }
                        catch (e) {
                            if (e.message.indexOf('Oracle has already approved') > -1) {
                                console.log('Oracle has already approved');
                            }
                            else {
                                console.error(`Error sending teleport ${e.message}`);
                                // reject(e);
                            }
                        }
                    });

                    await sleep(500);
                }
            }

            resolve();
        }
        catch (e) {
            reject(e);
        }
    })
}

const run = async (from_block = 'latest') => {
    while (true) {
        try {
            const block = await provider.getBlock('latest');
            const latest_block = block.number;

            if (from_block === 'latest') {
                // load last seen block from file
                from_block = await load_block();
                if (from_block !== 'latest') {
                    console.log(`Starting from save block of ${from_block}`)
                }
            }
            if (from_block === 'latest') {
                // could not get block from file and it wasn't specified (go back 100 blocks)
                from_block = latest_block - 100;
                // console.log(block, from_block)
            }
            const { to_block, up_to_date } = nextWindow(from_block, latest_block);

            if (up_to_date) {
                console.log(`Up to date at block ${to_block}`);
                await sleep(10000);
            }
            console.log(`Getting events from block ${from_block} to ${to_block}`)

            await process_claimed(from_block, to_block);
            await process_teleported(from_block, to_block);

            from_block = to_block;

            // save last block received
            await save_block(to_block);

            if (latest_block - from_block <= 1000) {
                console.log('Waiting...');
                await sleep(30000);
            }
            else {
                console.log(`Not waiting... ${latest_block} - ${from_block}`);
            }
        }
        catch (e) {
            console.error(e.message);
        }
    }
}

let start_block = 'latest';
if (process.argv[2]) {
    const lb = parseInt(process.argv[2]);
    if (isNaN(lb)) {
        console.error(`You must supply start block as an integer on command line`);
        process.exit(1);
    }
    start_block = lb;
}
else if (process.env['START_BLOCK']) {
    const lb = parseInt(process.env['START_BLOCK']);
    if (isNaN(lb)) {
        console.error(`You must supply start block as an integer in env`);
        process.exit(1);
    }
    start_block = lb;
}

run(start_block);
