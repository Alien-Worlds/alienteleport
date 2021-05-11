#!/usr/bin/env node

/*
This oracle listens to the EOSIO chain for teleport actions using a state history node

After receiving a teleport action, it will sign the data and then send it to the EOS chain where the client can pick
it up and then send it to the ethereum chain in a claim action
 */

const config_file = process.env['CONFIG'] || './config';
process.title = `oracle-eos ${config_file}`;

const StateReceiver = require('@eosdacio/eosio-statereceiver');
const {Api, JsonRpc, Serialize} = require('eosjs');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');
const fetch = require('node-fetch');
const { TextDecoder, TextEncoder } = require('text-encoding');
const { fork } = require('child_process');

const Web3 = require('web3');
const ethUtil = require('ethereumjs-util');

const config = require(config_file);

const web3 = new Web3(new Web3.providers.HttpProvider(config.eth.endpoint));
const signatureProvider = new JsSignatureProvider([config.eos.privateKey]);
const rpc = new JsonRpc(config.eos.endpoint, {fetch});
const eos_api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });

let tx_dispatcher = null;

// const ethAbi = require(`./eth_abi`);

class TraceHandler {
    constructor({config}) {
        this.config = config;
        this.queue = [];
        this.processingQueue = false;
        setInterval(this.processQueue.bind(this), 1000);
    }

    async processQueue() {
        if (!this.queue.length || this.processingQueue){
            return;
        }
        if (!tx_dispatcher){
            console.log(`No dispatcher yet`);
        }

        this.processingQueue = true;
        console.log(this.queue.length + ' items in the queue')
        const item = this.queue.pop();
        console.log(`Process item ${JSON.stringify(item)}`);

        const data = item.data;
        const data_serialized = item.data_serialized;
        let retries = item.retries;

        if (retries > 20){
            console.error(`Exceeded retries`);
            return;
        }

        try {
            const teleport_res = await rpc.get_table_rows({
                code: config.eos.teleportContract,
                scope: config.eos.teleportContract,
                table: 'teleports',
                lower_bound: data.id,
                upper_bound: data.id,
                limit: 1
            });
            // console.log(teleport_res);
            if (!teleport_res.rows.length){
                throw new Error(`Could not find teleport with id ${data.id}`);
            }
            const chain_data = teleport_res.rows[0];


            // sign the transaction and send to the eos chain
            const data_buf = Buffer.from(data_serialized);
            const msg_hash = ethUtil.keccak(data_buf);
            console.log(msg_hash.toString('hex'));
            // console.log(this.config.eth.privateKey);
            const pk = Buffer.from(this.config.eth.privateKey, "hex");
            const sig = ethUtil.ecsign(msg_hash, pk);
            // console.log(pk, sig);

            const signature = ethUtil.toRpcSig(sig.v, sig.r, sig.s);
            console.log(`Created signature ${signature}`);

            const actions = [{
                account: config.eos.teleportContract,
                name: 'sign',
                authorization: [{
                    actor: config.eos.oracleAccount,
                    permission: config.eos.oraclePermission || 'active'
                }],
                data: {
                    oracle_name: config.eos.oracleAccount,
                    id: data.id,
                    signature
                }
            }];

            console.log('Sending signature');

            tx_dispatcher.send(JSON.stringify(actions));
        }
        catch (e){
            console.error(`Error pushing confirmation ${e.message}`);
            setTimeout(() => {
                item.retries++;
                this.queue.push(item);
                // this.sendSignature(data, data_serialized, ++retries);
            }, 1000 * retries + 1);
        }

        this.processingQueue = false;
    }

    async sendSignature(data, data_serialized, retries=0) {
        console.log(data, data_serialized, Buffer.from(data_serialized).toString('hex'));
        this.queue.push({data, data_serialized, retries});

        // verify signature
        /*var sigDecoded = ethUtil.fromRpcSig(signature)
        var recoveredPub = ethUtil.ecrecover(msg_hash, sigDecoded.v, sigDecoded.r, sigDecoded.s)
        var recoveredAddress = ethUtil.pubToAddress(recoveredPub).toString("hex")
        console.log(sigDecoded, recoveredPub.toString('hex'), recoveredAddress);*/
    }

    async processTrace(block_num, traces, block_timestamp) {
        // console.log(block_num);

        for (const trace of traces) {
            switch (trace[0]) {
                case 'transaction_trace_v0':
                    const trx = trace[1];
                    // console.log(trx)
                    for (let action of trx.action_traces) {
                        //console.log(action)
                        switch (action[0]) {
                            case 'action_trace_v0':
                                if (action[1].act.account === this.config.eos.teleportContract && action[1].act.name === 'logteleport'){
                                    const action_deser = await eos_api.deserializeActions([action[1].act]);
                                    console.log(`Sending ${action_deser[0].data.quantity} to ${action_deser[0].data.eth_address}`, action_deser[0].data);
                                    this.sendSignature(action_deser[0].data, action[1].act.data);
                                }
                                break;
                        }
                    }
            }
        }
    }
}


const start = async (config, start_block) => {
    const trace_handler = new TraceHandler({config});

    sr = new StateReceiver({
        startBlock: start_block,
        endBlock: 0xffffffff,
        mode: 0,
        config,
        irreversibleOnly: true
    });

    sr.registerTraceHandler(trace_handler);
    sr.start();
}

const run = async (config) => {
    console.log(`Starting EOS watcher for ETH oracle ${config.eth.oracleAccount}`);

    let start_block;
    if (typeof process.argv[2] !== 'undefined'){
        start_block = parseInt(process.argv[2]);
        if (isNaN(start_block)){
            console.error(`Start block must be a number`);
            process.exit(1);
        }
    }
    else {
        const info = await rpc.get_info();
        start_block = info.head_block_num;
    }

    console.log(`Starting tx dispatcher`);
    tx_dispatcher = fork('./txdispatch', [JSON.stringify(config)]);
    tx_dispatcher.on('message', (msg) => {
        const json = JSON.parse(msg);
        if (json.type === 'success'){
            console.log(`Pushed confirmation with txid ${json.txid}`);
        }
        else if (json.type === 'error'){
            console.error(`Error pushing signature ${json.message}`);
            setTimeout(() => {
                tx_dispatcher.send(JSON.stringify(json.actions));
            }, 1000);
        }
    });

    start(config, start_block);
}

run(config);
