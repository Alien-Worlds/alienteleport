#!/usr/bin/env node

/*
This oracle listens to the ethereum blockchain for `Teleport` events.

When an event is received, it will
 */
const {Api, JsonRpc} = require('eosjs');
const {TextDecoder, TextEncoder} = require('text-encoding');
const Web3 = require('web3');
const ethUtil = require('ethereumjs-util');

const {JsSignatureProvider} = require('eosjs/dist/eosjs-jssig');
const fetch = require('node-fetch');

const config = require(process.env['CONFIG'] || './config');

const ethAbi = require(`./eth_abi`);

const web3 = new Web3(new Web3.providers.WebsocketProvider(config.eth.wsEndpoint));
const contract = new web3.eth.Contract(ethAbi, config.eth.teleportContract);
const signatureProvider = new JsSignatureProvider([config.eos.privateKey]);
const rpc = new JsonRpc(config.eos.endpoint, {fetch});
const eos_api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });



const run = async (config, start_block = 'latest') => {
    console.log(`Starting ETH watcher for EOS oracle ${config.eos.oracleAccount}`);

    contract.events.Teleport({
        fromBlock: start_block
    })
        .on('data', async function(event){
            const to = event.returnValues.to
            const amount = (event.returnValues.tokens / Math.pow(10, config.precision)).toFixed(config.precision);
            const quantity = `${amount} ${config.symbol}`
            const txid = event.transactionHash.replace(/^0x/, '');
            console.log(`Sending ${amount} tokens to ${to} from txid ${txid}`);
            // receive(name oracle_name, name to, checksum256 ref, asset quantity)
            const actions = [{
                account: config.eos.teleportContract,
                name: 'received',
                authorization: [{
                    actor: config.eos.oracleAccount,
                    permission: 'active'
                }],
                data: {
                    oracle_name: config.eos.oracleAccount,
                    to,
                    ref: txid,
                    quantity
                }
            }];

            try {
                const res = await eos_api.transact({actions}, {
                    blocksBehind: 3,
                    expireSeconds: 30,
                });
                console.log(`Sent confirmation with txid ${res.transaction_id}`);
            }
            catch (e){
                console.error(`Error pushing confirmation ${e.message}`);
            }
        })
        .on('error', console.error);
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
