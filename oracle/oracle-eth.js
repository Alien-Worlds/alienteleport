#!/usr/bin/env node

/*
This oracle listens to the ethereum blockchain for `Teleport` events.

When an event is received, it will call the `received` action on the EOS chain
 */

process.title = `oracle-eth ${process.env['CONFIG']}`;

const {Api, JsonRpc} = require('eosjs');
const {TextDecoder, TextEncoder} = require('text-encoding');
const Web3 = require('web3');
const ethUtil = require('ethereumjs-util');
const abiDecoder = require('abi-decoder');

const {JsSignatureProvider} = require('eosjs/dist/eosjs-jssig');
const fetch = require('node-fetch');

const config = require(process.env['CONFIG'] || './config');

const ethAbi = require(`./eth_abi`);
abiDecoder.addABI(ethAbi);

const web3 = new Web3(new Web3.providers.WebsocketProvider(config.eth.wsEndpoint, {clientConfig:{maxReceivedFrameSize: 10000000000,maxReceivedMessageSize: 10000000000}}));
const contract = new web3.eth.Contract(ethAbi, config.eth.teleportContract);
const signatureProvider = new JsSignatureProvider([config.eos.privateKey]);
const rpc = new JsonRpc(config.eos.endpoint, {fetch});
const eos_api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });

const DEFAULT_INTERVAL = 5000;
const DEFAULT_BLOCKS_TO_WAIT = 5;

const waitTransaction = async (web3, txnHash, options) =>  {
    const interval = options && options.interval ? options.interval : DEFAULT_INTERVAL;
    const blocksToWait =
        options && options.blocksToWait
            ? options.blocksToWait
            : DEFAULT_BLOCKS_TO_WAIT;
    const transactionReceiptAsync = async function(txnHash, resolve, reject) {
        try {
            const receipt = web3.eth.getTransactionReceipt(txnHash);
            if (!receipt) {
                setTimeout(function() {
                    transactionReceiptAsync(txnHash, resolve, reject);
                }, interval);
            } else {
                if (blocksToWait > 0) {
                    const resolvedReceipt = await receipt;
                    if (!resolvedReceipt || !resolvedReceipt.blockNumber)
                        setTimeout(function() {
                            // this.logger.debug("Polling");
                            transactionReceiptAsync(txnHash, resolve, reject);
                        }, interval);
                    else {
                        try {
                            const block = await web3.eth.getBlock(resolvedReceipt.blockNumber);
                            const current = await web3.eth.getBlock("latest");
                            if (current.number - block.number >= blocksToWait) {
                                var txn = await web3.eth.getTransaction(txnHash);
                                if (txn.blockNumber != null) resolve(resolvedReceipt);
                                else
                                    reject(
                                        new Error(
                                            "Transaction with hash: " +
                                            txnHash +
                                            " ended up in an uncle block."
                                        )
                                    );
                            } else
                                setTimeout(function() {
                                    transactionReceiptAsync(txnHash, resolve, reject);
                                }, interval);
                        } catch (e) {
                            setTimeout(function() {
                                transactionReceiptAsync(txnHash, resolve, reject);
                            }, interval);
                        }
                    }
                } else resolve(receipt);
            }
        } catch (e) {
            reject(e);
        }
    };

    // Resolve multiple transactions once
    if (Array.isArray(txnHash)) {
        var promises = [];
        txnHash.forEach(function(oneTxHash) {
            promises.push(waitTransaction(web3, oneTxHash, options));
        });
        return Promise.all(promises);
    } else {
        return new Promise(function(resolve, reject) {
            transactionReceiptAsync(txnHash, resolve, reject);
        });
    }
}

const eventValue = (eventData, name) => {
    let val = null;
    const data = eventData.find(e => e.name === name);
    if (data){
        val = data.value;
    }
    return val;
}

const getActionFromEvent = (event, confirmed = false) => {
    // console.log(event)
    const tokens = eventValue(event.data, 'tokens');
    if (tokens <= 0){
        throw new Error('Tokens are less than or equal to 0');
    }
    const to = eventValue(event.data, 'to');
    const chain_id = eventValue(event.data, 'chainId');
    const amount = (tokens / Math.pow(10, config.precision)).toFixed(config.precision);
    const quantity = `${amount} ${config.symbol}`
    const txid = event.transactionHash.replace(/^0x/, '');

    return {
        account: config.eos.teleportContract,
        name: 'received',
        authorization: [{
            actor: config.eos.oracleAccount,
            permission: config.eos.oraclePermission || 'active'
        }],
        data: {
            oracle_name: config.eos.oracleAccount,
            to,
            ref: txid,
            quantity,
            chain_id,
            confirmed
        }
    }
}


const sendConfirmation = async (event) => {
    try {
        console.log(`Waiting for confirmed tx ${event.transactionHash}`);
        await waitTransaction(web3, event.transactionHash, {blocksToWait: 5, internal: 5000});
        console.log(`Tx ${event.transactionHash} confirmed`);
        const action = getActionFromEvent(event, true);
        const actions = [action];
        // console.log(action.data)

        const res = await eos_api.transact({actions}, {
            blocksBehind: 3,
            expireSeconds: 30,
        });
        console.log(`Sent confirmation with txid ${res.transaction_id}`);
    }
    catch (e){
        console.error(`Error pushing confirmation ${e.message}`);

        if (e.message.indexOf('already completed') === -1 && e.message.indexOf('Tokens are less than or equal to 0')){
            const rand = Math.random() * 20;
            setTimeout(() => {
                sendConfirmation(event);
            }, rand * 1000);
        }
    }
}


let claimed_last_block = null;
let teleport_last_block = null;
const handleLog = async (log) => {
    const eventData = abiDecoder.decodeLogs([log])[0];
    log.data = eventData.events;
    const actions = [];

    console.log('Handle Log', log)

    switch (eventData.name){
        case 'Teleport':
            teleport_last_block = log.blockNumber;
            const action = getActionFromEvent(log);
            actions.push(action);

            try {
                const res = await eos_api.transact({actions}, {
                    blocksBehind: 3,
                    expireSeconds: 30,
                });
                console.log(`Sent notification of teleport with txid ${res.transaction_id}`);
            }
            catch (e){
                console.error(`Error pushing notification ${e.message}`);
            }

            console.log(`Starting process to wait for confirmation for ${log.transactionHash}`);
            sendConfirmation(log);

            break;
        case 'Claimed':
            claimed_last_block = log.blockNumber;
            const id = eventValue(eventData.events, 'id');
            const to_eth = eventValue(eventData.events, 'to').replace('0x', '') + '000000000000000000000000'
            const quantity = (eventValue(eventData.events, 'tokens') / Math.pow(10, config.precision)).toFixed(config.precision) + ' ' + config.symbol;

            actions.push({
                account: config.eos.teleportContract,
                name: 'claimed',
                authorization: [{
                    actor: config.eos.oracleAccount,
                    permission: config.eos.oraclePermission || 'active'
                }],
                data: {
                    oracle_name: config.eos.oracleAccount,
                    id,
                    to_eth,
                    quantity
                }
            });

            try {
                const res = await eos_api.transact({actions}, {
                    blocksBehind: 3,
                    expireSeconds: 30,
                });
                console.log(`Sent notification of claim with txid ${res.transaction_id}`);
            }
            catch (e){
                console.error(`Error pushing claim confirmation ${e.message}`);
            }
            break;
    }
}

let claimed_subscription = null;
let teleport_subscription = null;
const claimed_topic = '0xf20fc6923b8057dd0c3b606483fcaa038229bb36ebc35a0040e3eaa39cf97b17';
const teleport_topic = '0x622824274e0937ee319b036740cd0887131781bc2032b47eac3e88a1be17f5d5';

const unsubscribe_claimed = async () => {
    return new Promise((resolve) => {
        if (claimed_subscription){
            claimed_subscription.unsubscribe((err, success) => {
                resolve()
            });
        }
        else {
            resolve()
        }
    });
}
const unsubscribe_teleport = async () => {
    return new Promise((resolve) => {
        if (teleport_subscription){
            teleport_subscription.unsubscribe((err, success) => {
                resolve()
            });
        }
        else {
            resolve()
        }
    });
}

const subscribe = async (config) => {
    console.log('subscribing to all events');
    await unsubscribe_claimed();
    await unsubscribe_teleport();

    claimed_subscription = web3.eth.subscribe('logs', {fromBlock: start_block, address: config.eth.teleportContract, topics: [claimed_topic]}, function(err, res){
        if (err){
            console.error(`Error subscribing to claim logs ${err.message}`);
        }
    }).on("data", handleLog).on("error", async (e) => {
        console.log('Error in claimed log listener', e);
        await unsubscribe_claimed();
        await unsubscribe_teleport();
        subscribe(config);
    });

    teleport_subscription = web3.eth.subscribe('logs', {fromBlock: start_block, address: config.eth.teleportContract, topics: [teleport_topic]}, function(err, res){
        if (err){
            console.error(`Error subscribing to teleport logs ${err.message}`);
        }
    }).on("data", handleLog).on("error", async (e) => {
        console.log('Error in teleport log listener', e);
        await unsubscribe_claimed();
        await unsubscribe_teleport();
        subscribe(config);
    });
}

const run = async (config, start_block = 'latest') => {
    console.log(`Starting ETH watcher for EOS oracle ${config.eos.oracleAccount}, starting at ${start_block}`);

    claimed_last_block = start_block;
    teleport_last_block = start_block;

    subscribe(config);
};

let start_block = 'latest';
if (process.argv[2]){
    const lb = parseInt(process.argv[2]);
    if (isNaN(lb)){
        console.error(`You must supply start block as an integer on command line`);
        process.exit(1);
    }
    start_block = lb;
}
else if (process.env['START_BLOCK']){
    const lb = parseInt(process.env['START_BLOCK']);
    if (isNaN(lb)){
        console.error(`You must supply start block as an integer in env`);
        process.exit(1);
    }
    start_block = lb;
}
console.log(`Starting from block ${start_block}`);

run(config, start_block);
