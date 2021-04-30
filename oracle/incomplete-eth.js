#!/usr/bin/env node

/*
Lists all incomplete teleports from eos -> eth
 */

const config_file = process.env['CONFIG'] || './config';
process.title = `incomplete-eos ${config_file}`;

const {Api, JsonRpc, Serialize} = require('eosjs');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');
const fetch = require('node-fetch');
const { TextDecoder, TextEncoder } = require('text-encoding');

const hyperion_endpoint = 'https://api.waxsweden.org';

const config = require(config_file);

const signatureProvider = new JsSignatureProvider([config.eos.privateKey]);
const rpc = new JsonRpc(config.eos.endpoint, {fetch});
const eos_api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });


const run = async () => {
    let lower_bound = 1;
    const incomplete = [];
    while (true){
        const res = await rpc.get_table_rows({
            code: config.eos.teleportContract,
            scope: config.eos.teleportContract,
            table: 'receipts',
            lower_bound,
            limit: 100
        });

        // console.log(res)

        res.rows.forEach(r => {
            if (r.confirmations < 3){
                incomplete.push(r);
            }
        });


        if (res.more){
            lower_bound = res.next_key;
        }
        else {
            break;
        }
    }
    //
    // console.log(incomplete);
    // return;

    for (let i = 0; i < incomplete.length; i++){
        console.log(`${incomplete[i].to}, 0x${incomplete[i].ref} , ${JSON.stringify(incomplete[i].approvers)}`)
    }
}

run()
