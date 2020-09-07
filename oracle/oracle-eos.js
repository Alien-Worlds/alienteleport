#!/usr/bin/env node

/*
This oracle listens to the EOSIO chain for teleport actions using a state history node

After receiving a teleport action, it will send notification to the ETH blockchain, after 3 similar oracles have
sent the `received` action to the ethereum contract, the ethereum contract will transfer the tokens to the account
specified in the EOSIO `teleport` action.
 */

process.title = `oracle-eos ${process.env['CONFIG']}`;

const StateReceiver = require('@eosdacio/eosio-statereceiver');
const {Api, JsonRpc, Serialize} = require('eosjs');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');
const fetch = require('node-fetch');
const { TextDecoder, TextEncoder } = require('text-encoding');

const Web3 = require('web3');
const ethUtil = require('ethereumjs-util');

const config = require(process.env['CONFIG'] || './config');

const web3 = new Web3(new Web3.providers.HttpProvider(config.eth.endpoint));
const rpc = new JsonRpc(config.eos.endpoint, {fetch});
const eos_api = new Api({ rpc, signatureProvider:null, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });

const ethAbi = require(`./eth_abi`);

class TraceHandler {
    constructor({config}) {
        this.config = config;
    }

    async sendReceipt(to, quantity, tx_id, retries=0) {
        if (retries > 5){
            console.error(`Exceeded retries`);
        }

        const [amount_str] = quantity.split(' ');
        const amount = parseFloat(amount_str) * Math.pow(10, this.config.precision);
        console.log(`${amount} satoshis being sent from ${tx_id}`);

        const pubKey = ethUtil.privateToPublic(Buffer.from(this.config.eth.privateKey, 'hex'));
        const addr = ethUtil.publicToAddress(pubKey).toString('hex');
        const pk = ethUtil.toChecksumAddress(`0x${this.config.eth.privateKey.toString('hex')}`);
        const address = ethUtil.toChecksumAddress(`0x${addr}`);
        const contract = new web3.eth.Contract(ethAbi, this.config.eth.teleportContract);

        const data = contract.methods.received(to, web3.eth.abi.encodeParameter('uint256', '0x' + tx_id), amount).encodeABI();

        const tx = {
            from: address,
            to: this.config.eth.teleportContract,
            value: 0,
            data
        };
        const gasEstimate = await web3.eth.estimateGas(tx);

        const gas = BigInt(gasEstimate);
        const gas_price = 20n * 1000000000n;  // 10 gwei

        tx.gas = '0x' + gas.toString(16);
        tx.gasPrice = '0x' + gas_price.toString(16);

        const signed = await web3.eth.accounts.signTransaction(tx, pk);
        // console.log(signed)
        const sent_tx = web3.eth.sendSignedTransaction(signed.rawTransaction);

        sent_tx.on("receipt", receipt => {
            console.log(`Transaction sent ${receipt.transactionHash} from ${address}`);
        });
        sent_tx.on("error", err => {
            // do something on transaction error
            console.error(`Transaction error`, err.message);

            setTimeout(() => {
                this.sendReceipt(to, quantity, tx_id, ++retries);
            }, 1000);
        });
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
                                if (action[1].act.account === this.config.eos.teleportContract && action[1].act.name === 'teleport'){
                                    const action_deser = await eos_api.deserializeActions([action[1].act]);
                                    console.log(`Sending ${action_deser[0].data.quantity} to ${action_deser[0].data.eth_address}`);
                                    this.sendReceipt(action_deser[0].data.eth_address, action_deser[0].data.quantity, trx.id);
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

    start(config, start_block);
}

run(config);
